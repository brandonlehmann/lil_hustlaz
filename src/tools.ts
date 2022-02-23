interface INFT {
    name: string;
    image: string;
    id: string;
    attributes: {
        trait_type: string;
        value: string;
        count?: number;
        frequency?: string;
    }[]
}

const loadMeta = (tokenId: number): INFT => {
    const meta: INFT = require('../src/schema/' + tokenId + '.json');

    meta.image = './assets/' + meta.image
        .split('/')
        .slice(-2)
        .join('/');

    return meta;
};

const getAttributeValue = (meta: INFT, key: string): string => {
    for (const attrib of meta.attributes) {
        if (attrib.trait_type.toLowerCase() === key.toLowerCase()) {
            return attrib.value;
        }
    }

    return 'Unknown';
};

export { loadMeta, getAttributeValue };
