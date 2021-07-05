import { terser } from 'rollup-plugin-terser';
 
import json from '@rollup/plugin-json';

import pkg from './package.json';

const { name } = pkg
const ESM = 'esm'
const CJS = 'cjs'
const UMD = 'umd'

const configs = {
    [ESM]: {
        file: `dist/${name}.esm.js`,
        format: ESM,// cjs iife umd amd es system
        name,
        exports: 'named',
        inlineDynamicImports: true,
    },

    [CJS]: {
        file: `dist/${name}.cjs.js`,
        format: CJS,
        name,
        //options：default（只能export default）、named（支持export和export default共存）、none（不需要export、export default时）
        // exports: 'named',

    },
    [UMD]: {
        file: `dist/${name}.min.js`,
        format: UMD,
        name,
        exports: 'named',
        plugins: [
            terser(),
        ],
        extend: true
    },
}

const createBundleConf = (type) => ({
    input: './src/index.js',
    output: configs[type],
    plugins: [
        json(), 
    ]

})

export default Object.keys(configs).map(createBundleConf);