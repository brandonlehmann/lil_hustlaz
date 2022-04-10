import { IERC721Metadata, fetch } from '@brandonlehmann/web3';

const loadMeta = async (tokenId: number): Promise<IERC721Metadata> => {
    const response = await fetch('./schema/' + tokenId + '.json?=' + (new Date()).toTimeString());

    if (!response.ok) {
        throw new Error('could not retrieve');
    }

    const meta: IERC721Metadata = await response.json();

    meta.image = meta.image.replace('ipfs://', 'https://cloudflare-ipfs.com/ipfs/');

    return meta;
};

const getAttributeValue = (meta: IERC721Metadata, key: string): string => {
    for (const attrib of meta.attributes) {
        if (attrib.trait_type.toLowerCase() === key.toLowerCase()) {
            return attrib.value.toString();
        }
    }

    return 'Unknown';
};

export { loadMeta, getAttributeValue };
