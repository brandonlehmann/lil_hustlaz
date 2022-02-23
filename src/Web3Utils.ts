import Web3Modal, { IProviderOptions } from 'web3modal';
import { ethers, BigNumber } from 'ethers';
import { EventEmitter } from 'events';
import WalletConnectProvider from '@walletconnect/web3-provider';
import { WalletLink } from 'walletlink/dist/WalletLink';
import * as ls from 'local-storage';
import Metronome from 'node-metronome';
import fetch from 'cross-fetch';

interface IChainlistChain {
    chain: string;
    chainId: number;
    infoURL: string;
    ens: {
        registry: string;
    };
    explorers: {
        name: string;
        url: string;
        standard: string;
    }[];
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    networkId: number;
    rpc: string[];
    shortName: string;
    slip44: number;
}

export const DefaultProviderOptions: IProviderOptions = {
    walletconnect: {
        package: WalletConnectProvider,
        options: {
            rpc: {}
        }
    },
    'custom-walletlink': {
        package: WalletLink,
        display: {
            logo: 'https://play-lh.googleusercontent.com/wrgUujbq5kbn4Wd4tzyhQnxOXkjiGqq39N4zBvCHmxpIiKcZw_' +
                'Pb065KTWWlnoejsg=s360-rw',
            name: 'Coinbase Wallet',
            description: 'Connect to Coinbase Wallet'
        },
        options: {
            rpc: '',
            appName: '',
            chainId: 0
        },
        connector: async (_, options) => {
            const { appName, rpc, chainId } = options;
            const instance = new WalletLink({
                appName
            });
            const provider = instance.makeWeb3Provider(rpc, chainId);
            if (provider.isConnected()) {
                provider.disconnect();
            }
            await provider.enable();
            return provider;
        }
    }
};

export { ethers, IProviderOptions };

const sleep = async (timeout: number) => new Promise(resolve => setTimeout(resolve, timeout * 1000));

let Web3ControllerSingleton: any;

export default class Web3Controller extends EventEmitter {
    private _connected = false;
    private _instance?: ethers.providers.Web3Provider;
    private _signer?: ethers.Signer;
    public modal: Web3Modal;
    private _chains: IChainlistChain[] = [];
    private _checkTimer?: Metronome;

    protected constructor (
        public readonly appName: string,
        private readonly providerOptions: IProviderOptions = DefaultProviderOptions,
        public readonly cacheProvider = false
    ) {
        super();

        this.modal = new Web3Modal({
            network: 'mainnet',
            cacheProvider: this.cacheProvider,
            providerOptions: this.providerOptions
        });
    }

    /**
     * Loads the singleton instance of the widget controller
     *
     * @param appName
     * @param providerOptions
     * @param cacheProvider
     */
    public static async load (
        appName = 'Unknown Application',
        providerOptions: IProviderOptions = DefaultProviderOptions,
        cacheProvider = false
    ): Promise<Web3Controller> {
        if (Web3ControllerSingleton) {
            return Web3ControllerSingleton;
        }

        const instance = new Web3Controller(appName, providerOptions, cacheProvider);

        await instance.getChains();

        Web3ControllerSingleton = instance;

        return instance;
    }

    /**
     * Returns if the widget is connected to web3
     */
    public get connected (): boolean {
        return this._connected;
    }

    /**
     * Returns the connected signer
     */
    public get signer (): ethers.Signer {
        if (this.connected && this._signer) {
            return this._signer;
        }

        throw new Error('Not connected or signer not found');
    }

    /**
     * Returns the currently connected chain ID
     */
    public async chainId (): Promise<number> {
        return this.signer.getChainId();
    }

    /**
     * Returns the connected Web3 provider
     */
    public get provider (): ethers.providers.Web3Provider {
        if (this.connected && this._instance) {
            return this._instance;
        }

        throw new Error('Not connected or provider not found');
    }

    public on(event: 'accountsChanged', listener: (accounts: string[]) => void): this;
    public on(event: 'chainChanged', listener: (chainId: number) => void): this;
    public on(event: 'connect', listener: (info: {chainId: number}) => void): this;
    public on(event: 'disconnect', listener: (error: {code: number, message: string}) => void): this;
    public on (event: any, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Attempts to fetch the ABI information for the specified contract from an explorer
     *
     * @param contract_address
     * @param chainId
     */
    public async fetchABI (contract_address: string, chainId?: number): Promise<string> {
        const chains = await this.getChains();
        const connectedChainId = chainId || await this.signer.getChainId();

        const cacheId = connectedChainId + '_' + contract_address;

        {
            const abi = ls.get<string>(cacheId);

            if (abi && abi.length !== 0) {
                return abi;
            }
        }

        let url = '';

        for (const chain of chains) {
            if (chain.chainId === connectedChainId && chain.explorers.length !== 0) {
                url = chain.explorers[0].url.replace('https://', 'https://api.');
                url += '/api?module=contract&action=getabi&address=' + contract_address;
            }
        }

        if (url.length === 0) {
            throw new Error('Cannot find explorer for chain: ' + connectedChainId);
        }

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Could not fetch ABI');
        }

        const json = await response.json();

        if (json.result && json.status === '1') {
            ls.set(cacheId, json.result);

            return json.result;
        }

        await sleep(5);

        return this.fetchABI(contract_address);
    }

    /**
     * Loads the specified contract using the connected signer
     *
     * @param contract_address
     * @param contract_abi
     * @param provider
     * @param chainId
     */
    public async loadContract (
        contract_address: string,
        contract_abi?: string,
        provider?: ethers.providers.Provider,
        chainId?: number
    ): Promise<ethers.Contract> {
        if (!contract_abi) {
            contract_abi = await this.fetchABI(contract_address, chainId);
        }

        return new ethers.Contract(contract_address, contract_abi, provider || this.signer);
    }

    /**
     * Displays the web3 modal and connects to the specified chain Id
     */
    public async connect () {
        if (this.connected) {
            await this.disconnect();
        }

        if (this.providerOptions['custom-walletlink']) {
            this.providerOptions['custom-walletlink'].options.appName = this.appName;
        }

        const chains = await this.getChains();

        for (const chain of chains) {
            if (chain.rpc.length !== 0) {
                if (this.providerOptions.walletconnect) {
                    this.providerOptions.walletconnect.options.rpc[chain.chainId] = chain.rpc[0];
                }

                if (this.providerOptions['custom-walletlink']) {
                    this.providerOptions['custom-walletlink'].options.rpc = chain.rpc[0];
                    this.providerOptions['custom-walletlink'].options.chainId = chain.chainId;
                }
            }
        }

        this.modal = new Web3Modal({
            network: 'mainnet',
            cacheProvider: this.cacheProvider,
            providerOptions: this.providerOptions
        });

        if (!this.cacheProvider && this.modal.clearCachedProvider) {
            await this.modal.clearCachedProvider();
        }

        this._instance = await this.modal.connect();

        if (!this._instance) {
            throw new Error('Web3Provider is undefined');
        }

        this._instance.on('accountsChanged', (accounts: string[]) => {
            this.emit('accountsChanged', accounts);
        });
        this._instance.on('chainChanged', (chainId: number) => {
            this.emit('chainChanged', BigNumber.from(chainId).toNumber());
        });
        this._instance.on('connect', (info: {chainId: number}) => {
            this._connected = true;

            this.emit('connect', { chainId: BigNumber.from(info.chainId).toNumber() });
        });
        this._instance.on('disconnect', async (error: {code: number, message: string}) => {
            await this.disconnect();

            this.emit('disconnect', error);
        });

        this._instance = new ethers.providers.Web3Provider(this._instance as any);

        this._signer = this._instance.getSigner();

        this._checkTimer = new Metronome(500, true);

        this._checkTimer.on('tick', async () => {
            try {
                const address = await this.signer.getAddress();

                if (address.length === 0) {
                    throw new Error('not connected');
                }
            } catch {
                await this.disconnect();

                this.emit('disconnect', { code: -1, message: 'Disconnected from provider' });
            }
        });

        this._connected = true;
    }

    /**
     * Disconnects the provider/signer/controller
     * @param clearCachedProvider whether to force the clearing of the cached provider
     */
    public async disconnect (clearCachedProvider = false) {
        if ((!this.cacheProvider || clearCachedProvider) && this.modal.clearCachedProvider) {
            this.modal.clearCachedProvider();
        }

        if (this._instance && (this._instance as any).close) {
            await (this._instance as any).close();
        }

        if (this._instance && (this._instance as any).disconnect) {
            await (this._instance as any).disconnect();
        }

        if (this._checkTimer) {
            this._checkTimer.destroy();
        }

        this._instance = undefined;

        this._connected = false;

        this._signer = undefined;

        this.emit('disconnect', { code: -1, message: 'Wallet disconnected' });
    }

    /**
     * Retrieves a list of EVM chains from chainlist.org
     *
     * @param listUrl
     * @protected
     */
    protected async getChains (listUrl = 'https://chainid.network/chains.json'): Promise<IChainlistChain[]> {
        if (this._chains.length !== 0) {
            return this._chains;
        }

        const response = await fetch(listUrl);

        if (!response.ok) {
            throw new Error('Could not fetch chain list');
        }

        const json = await response.json();

        this._chains = json;

        return json;
    }
}
