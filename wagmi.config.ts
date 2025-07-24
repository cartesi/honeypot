import { defineConfig } from "@wagmi/cli";
import { foundry } from "@wagmi/cli/plugins";

export default defineConfig({
  out: "tests/contracts.ts",
  plugins: [foundry({
    project: "node_modules/@cartesi/rollups",
    forge: {
      build: false,
    }
  })],
});
