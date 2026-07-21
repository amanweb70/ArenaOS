import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@arena/contracts": resolve("packages/contracts/src/index.ts"),
      "@arena/core": resolve("packages/core/src/index.ts"),
      "@arena/plugin-headless-grid": resolve(
        "plugins/headless-grid/src/index.ts"
      ),
      "@arena/plugin-scripted-agent": resolve(
        "plugins/scripted-agent/src/index.ts"
      ),
      "@arena/plugin-native-evaluators": resolve(
        "plugins/native-evaluators/src/index.ts"
      ),
      "@arena/plugin-royal-chess": resolve(
        "plugins/royal-chess/src/index.ts"
      ),
      "@arena/plugin-biocraft": resolve(
        "plugins/biocraft/src/index.ts"
      ),
      "@arena/plugin-chemcraft": resolve(
        "plugins/chemcraft/src/index.ts"
      ),
      "@arena/plugin-agent-rumble": resolve(
        "plugins/agent-rumble/src/index.ts"
      ),
      "@arena/plugin-personacraft": resolve(
        "plugins/personacraft/src/index.ts"
      ),
      "@arena/plugin-physical-ai": resolve(
        "plugins/physical-ai/src/index.ts"
      ),
      "@arena/plugin-openrouter-agent": resolve(
        "plugins/openrouter-agent/src/index.ts"
      ),
      "@arena/plugin-generated-environment": resolve(
        "plugins/generated-environment/src/index.ts"
      )
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
