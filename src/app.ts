import $ from 'jquery';
import 'bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import Metronome from 'node-metronome';
import { ethers } from '@brandonlehmann/ethers-providers';
import { loadMeta, getAttributeValue } from './tools';
import Web3Controller from './Web3Utils';

const winningTokenIds = [
    8, 16, 18, 32, 37,
    40, 43, 47, 50, 72,
    83, 99, 103, 123, 132,
    151, 159, 166, 184, 195,
    211, 246, 268, 287, 292,
    313, 341, 344, 356, 366,
    447, 459, 464, 477, 485,
    495
];

const nextWinner = (current: number): number => {
    for (const val of winningTokenIds) {
        if (val > current) {
            return val;
        }
    }

    return winningTokenIds[winningTokenIds.length - 1];
};

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
$(document).ready(async () => {
    const showStatus = async (success: boolean, message: any): Promise<void> => {
        const elem = $('#statusMessage');

        if (success) {
            elem.addClass('alert-success');
            elem.removeClass('alert-danger');
        } else {
            elem.addClass('alert-danger');
            elem.removeClass('alert-success');
        }

        if (message.data && message.data.message) {
            message = message.data.message;
        } else if (message.message) {
            message = message.message;
        }

        let finalMessage = message as string;

        if (finalMessage.toLowerCase().includes('while formatting outputs') ||
            finalMessage.toLowerCase().includes('internal error')) {
            finalMessage = 'Internal wallet error, please try again.';
        }

        if (finalMessage.toLowerCase().includes('ds-math-sub-underflow')) {
            finalMessage = 'Balance insufficient';
        }

        if (finalMessage.toLowerCase().includes('deposited token has no reward token value')) {
            finalMessage = 'Sorry, gTRTL reward must be greater than 0';
        }

        finalMessage = finalMessage.replace('execution reverted:', '').trim();

        elem.text(finalMessage);

        if (finalMessage.length !== 0) {
            console.log(finalMessage);
            $.noConflict();
            $('#statusModal').modal('toggle');
        }
    };

    const timer = new Metronome(15_000, true);

    const controller = await Web3Controller.load(
        'Spiritopoly Mint Helper',
        undefined,
        true);

    const commonProvider = new ethers.providers.JsonRpcProvider('https://rpc.ftm.tools/');
    let contract = (
        new ethers.Contract('0x5d24319358848E5e0f9f8a1F72e91DAf5A0F14df',
            require('../src/abi.json')))
        .connect(commonProvider);

    const totalSupply = async (): Promise<number> => {
        return (await contract.totalSupply()).toNumber();
    };

    const mint = async (tokenId: number): Promise<ethers.ContractTransaction> => {
        const price = await contract.price();

        console.log('Price: %s', price.toString());

        return contract.buySpirit(tokenId, { value: price });
    };

    let currentToken = 0;
    let nextWinnerToken = 0;

    timer.on('tick', async () => {
        try {
            timer.paused = true;

            const next = await totalSupply();

            if (next !== currentToken) {
                const meta = loadMeta(next);

                $('#nftVideo').attr('src', meta.image)
                    .trigger('play');
                $('#tokenId').val(next.toString());
                $('#nftBackground').val(getAttributeValue(meta, 'Background'));
                $('#nftGameToken').val(getAttributeValue(meta, 'Game Token'));
                $('#nftAppearance').val(getAttributeValue(meta, 'Token Appearance'));
                $('#nftRarity').val(getAttributeValue(meta, 'Overall Rarity'));
                $('#nftWinner').val((winningTokenIds.includes(next)) ? 'YES!' : 'No');

                if (winningTokenIds.includes(next)) {
                    $('#mintButton').text('Safe Mint #' + next);
                    $('#mintButton').removeAttr('disabled');
                } else {
                    $('#mintButton').text('Minting Disabled');
                    $('#mintButton').attr('disabled', 'disabled');
                }

                const winner = loadMeta(nextWinner(next));

                if (nextWinner(next) !== nextWinnerToken) {
                    $('#winVideo').attr('src', winner.image)
                        .trigger('play');
                    $('#winTokenId').val(nextWinner(next).toString());
                    $('#winBackground').val(getAttributeValue(winner, 'Background'));
                    $('#winGameToken').val(getAttributeValue(winner, 'Game Token'));
                    $('#winAppearance').val(getAttributeValue(winner, 'Token Appearance'));
                    $('#winRarity').val(getAttributeValue(winner, 'Overall Rarity'));
                    $('#winWinner').val((winningTokenIds.includes(nextWinner(next))) ? 'YES!' : 'No');

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
            const tx = await mint(currentToken);

            await tx.wait(2);

            timer.tick();

            showStatus(true, 'Successfully minted');
        } catch (e: any) {
            showStatus(false, e);
        }
    });

    button.on('click', async () => {
        if (!controller.connected) {
            button.text('Connecting...');

            try {
                await controller.connect();

                button.text('Disconnect Wallet');

                contract = contract.connect(controller.signer);

                showStatus(true, '');

                timer.tick();
            } catch (e: any) {
                button.text('Connect Wallet');

                showStatus(false, e);
            }
        } else {
            mintButton.attr('disabled', 'disabled');

            contract = contract.connect(commonProvider);

            await controller.disconnect(true);

            button.text('Connect Wallet');
        }
    });

    button.removeAttr('disabled');

    if (controller.cacheProvider && controller.modal.cachedProvider && controller.modal.cachedProvider.length !== 0) {
        button.click();
    }

    timer.tick();
})();
