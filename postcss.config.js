import tailwind from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';
import mobileTextSize from './scripts/mobile-text-size.mjs';

export default {plugins:[tailwind(),autoprefixer(),mobileTextSize()]};
