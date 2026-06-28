import { defineConfig } from 'orval'

// Gera o client tipado + hooks vue-query a partir do OpenAPI do backend Nest.
// O spec é capturado do backend rodando (`/api/docs-json`) e salvo em ./openapi.json
// (script `pnpm api:spec`). Rode `pnpm api:gen` para regenerar o client.
export default defineConfig({
  semantia: {
    input: {
      target: './openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: './src/api/generated',
      schemas: './src/api/generated/model',
      client: 'vue-query',
      httpClient: 'axios',
      clean: true,
      prettier: true,
      override: {
        mutator: {
          path: './src/api/mutator.ts',
          name: 'customInstance',
        },
      },
    },
  },
})
