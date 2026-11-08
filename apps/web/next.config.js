/** Keep Docker's dev artifacts separate from host builds mounted into /app. */
const distDir = process.env.NEXT_DIST_DIR || '.next';

/** @type {import('next').NextConfig} */
module.exports = {
  distDir,
  optimizeFonts: false,
};
