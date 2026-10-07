module.exports = {
  rootDir: "../",
  preset: "ts-jest",
  transformIgnorePatterns: [
    // Transform the ESM geometry used by the real robot rig, alongside the
    // existing ESM utilities; do not replace it with a mock primitive.
    "node_modules/(?!(chai|jsoncrush|three/examples/jsm/geometries/RoundedBoxGeometry))",
  ],
  transform: {
    // Use SWC for transforming both JavaScript and TypeScript files
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: {
          minify: {
            compress: false,
            mangle: false,
            format: { comments: "all" },
          },
          // Enable ESM support in SWC
          parser: {
            syntax: "typescript",
            tsx: true,
          },
          target: "es2020",
        },
      },
    ],
  },
  coveragePathIgnorePatterns: [
    "node_modules",
    "gltf.ts",
    "webgl.ts",
    "dom.ts",
    "shorten.ts",
    "assets.ts",
  ],
  testPathIgnorePatterns: ["/e2e/", "/test/worker/", "/packages/", "/\\.tmp/"],
  coverageReporters: ["text", "json"],
  testEnvironment: "jsdom",
  moduleNameMapper: {
    ".*GLTFExporter": "<rootDir>/test/mocks/gltfexporter.ts",
    ".*GLTFLoader": "<rootDir>/test/mocks/gltfloader.ts",
    ".*/sound": "<rootDir>/test/mocks/mocksound.ts",
  },
  // Enable ESM support in Jest
  extensionsToTreatAsEsm: [".ts"],
  globals: {
    "ts-jest": {
      useESM: true, // Enable ESM support in ts-jest
    },
  },
}
