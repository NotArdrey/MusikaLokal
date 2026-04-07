# Offline LLM Native Module Contract

This app now includes a JavaScript enhancer that can use an on-device LLM if a native module is available.

The expected native module name is:
- MusikaOfflineLLM

The JS side looks for one or more of these methods:
- isModelReady(): Promise<boolean> | boolean
- prepareModel(): Promise<boolean> | boolean
- generateJson(payload): Promise<string | object>
- generateText(prompt, options): Promise<string>

## Required behavior

1. Keep all inference local on device.
2. Never call network APIs during generation.
3. Return deterministic JSON-safe output when possible.
4. Keep generation under 3.5 seconds for suggestion enhancement.

## Expected generateJson payload

The app sends this shape:

{
  "prompt": "...",
  "systemPrompt": "...",
  "maxTokens": 650,
  "temperature": 0.3
}

## Minimal response format

Return either:
- JSON string, or
- object serializable to JSON

Recommended JSON shape:

{
  "recommendations": [
    {
      "name": "candidate name",
      "headline": "short line",
      "whyThisFits": "1-2 short sentences",
      "proTip": "actionable tip",
      "perfectFor": "short tag",
      "scoreDelta": 2
    }
  ]
}

## Integration notes

1. Expo Go cannot load custom native modules.
2. Use Expo Dev Client or a custom native build.
3. Keep model assets quantized and sized for target devices.
4. Implement a local model store and call prepareModel on first run.

## Existing JS integration point

- src/services/offlineLlmEnhancer.ts

The AI suggestions screen is currently configured in LLM-only mode.

If the on-device LLM runtime is missing, not ready, invalid, or times out,
the app returns an error message and does not use local-ranking fallback for that flow.
