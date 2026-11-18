import { readFileSync } from "node:fs";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
// Shown in "About nonoha Editor" and sent to the engine inspector as the client name.
const editorVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

/** @type {import('next').NextConfig} */
const nextConfig = {
    basePath: basePath,
    output: "export",
    trailingSlash: true,
    transpilePackages: ['nonoha-client-js', 'nonoha-views'],
    eslint: {
        dirs: ['app', 'src', 'packages/nonoha-views/src'],
    },
    env: {
        NEXT_PUBLIC_EDITOR_VERSION: editorVersion,
    },
    compiler: {
        emotion: true
    },
};

export default nextConfig;
