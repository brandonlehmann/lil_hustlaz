import { loadMeta, getAttributeValue } from './tools';
import Web3Controller, { Metronome, ethers, ERC721, BigNumber } from '@brandonlehmann/web3';
import { $, showStatusModal } from '@brandonlehmann/web3/dist/UITools';

const winningTokenIds = [
    72, 2889, 8346, 1164, 4960, 7263, 5319, 3833, 9502, 6585
].sort();

const nextWinner = (current: number): number => {
    for (const val of winningTokenIds) {
        if (val > current) {
            return val;
        }
    }

    return winningTokenIds[winningTokenIds.length - 1];
};

class LilHustlaz extends ERC721 {
    public async price (): Promise<BigNumber> {
        return this.retryCall<BigNumber>(this.contract.price);
    }

    public async mintLilHustlaz (count: ethers.BigNumberish): Promise<ethers.ContractTransaction> {
        const price = await this.price();

        const sendVal = price.mul(count);

        console.log('Sending: %s', ethers.utils.formatEther(sendVal));

        return this.contract.mintLilHustlaz(count, { value: sendVal });
    }
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
$(document).ready(async () => {
    const timer = new Metronome(15_000, true);

    const nftImage = $('#nftVideo');
    const winImage = $('#winVideo');

    const controller = await Web3Controller.load(
        'Lil Hustlaz Mint Helper', {
            chainId: 1,
            cacheProvider: true
        });

    controller.on('connected', async (info) => {
        if (info.chainId !== 1 || (await controller.signer?.getChainId()) !== 1) {
            return showStatusModal(false, 'Please connect to the ethereum mainnet');
        }
    });

    controller.on('chainChanged', async (chainId) => {
        if (chainId !== 1 || (await controller.signer?.getChainId()) !== 1) {
            return showStatusModal(false, 'Please connect to the ethereum mainnet');
        }
    });

    const contract = new LilHustlaz(await controller.loadContract(
        '0xB80a06EA0f4D17DD7D4b584DAA483C760331137B', undefined, undefined, 1));

    let currentToken = 0;
    let nextWinnerToken = 0;

    timer.on('tick', async () => {
        try {
            timer.paused = true;

            const supply = (await contract.totalSupply()).toNumber() - 1;

            const next = (await contract.tokenByIndex(supply)).toNumber() + 1;

            if (next !== currentToken) {
                const meta = await loadMeta(next);

                nftImage.LoadingOverlay('show');
                nftImage.attr('src', meta.image);
                nftImage.on('load', () => {
                    nftImage.LoadingOverlay('hide');
                });
                $('#tokenId').val(next.toString());
                $('#nftRank').val(meta.rarity?.rank || 'Unknown');

                if (winningTokenIds.includes(next)) {
                    $('#mintButton').text('Mint #' + next);
                    $('#mintButton').removeAttr('disabled');
                } else {
                    $('#mintButton').text('Minting Disabled');
                    $('#mintButton').attr('disabled', 'disabled');
                }

                const winner = await loadMeta(nextWinner(next));

                if (nextWinner(next) !== nextWinnerToken) {
                    winImage.LoadingOverlay('show');
                    winImage.attr('src', winner.image);
                    winImage.on('load', () => {
                        winImage.LoadingOverlay('hide');
                    });
                    $('#winTokenId').val(nextWinner(next).toString());
                    $('#winRank').val(winner.rarity?.rank || 'Unknown');

                    nextWinnerToken = nextWinner(next);
                }
            }

            currentToken = next;
        } catch (e: any) {
            console.log(e.toString());
        } finally {
            timer.paused = false;
        }
    });

    const button = $('#connectWalletButton');
    const mintButton = $('#mintButton');

    mintButton.on('click', async () => {
        try {
            const tx = await contract.mintLilHustlaz(1);

            await tx.wait(2);

            timer.tick();

            showStatusModal(true, 'Successfully minted');
        } catch (e: any) {
            showStatusModal(false, e);
        }
    });

    button.on('click', async () => {
        if (!controller.connected) {
            button.text('Connecting...');

            try {
                await controller.showWeb3Modal();

                button.text('Disconnect Wallet');

                if (!controller.signer) {
                    return showStatusModal(false, 'Could not get wallet signer');
                }

                contract.connect(controller.signer);

                showStatusModal(true, '');

                timer.tick();
            } catch (e: any) {
                button.text('Connect Wallet');

                showStatusModal(false, e);
            }
        } else {
            await controller.disconnect(true);

            mintButton.attr('disabled', 'disabled');

            contract.connect(controller.provider);

            button.text('Connect Wallet');
        }
    });

    button.removeAttr('disabled');

    if (controller.isCached) {
        button.click();
    }

    timer.tick();
})();
