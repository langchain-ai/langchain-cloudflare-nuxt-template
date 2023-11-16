# Cloudflare + LangChain + Nuxt Multi-source Chatbot

This app is an example of a conversational retrieval system that can route between multiple data sources, choosing the one
more relevant to an incoming question. This helps cut down on distraction from off-topic documents getting
pulled in by the vectorstore's similarity search, which could occur if only a single database were used.

The base version runs entirely on the Cloudflare WorkersAI stack with a tiny open-source Llama 2-7B model, but you can
swap in more powerful models such as OpenAI's `gpt-3.5-turbo` to improve performance in key places if desired. It uses:

- A chat variant of Llama 2-7B run on Cloudflare WorkersAI
- A Cloudflare WorkersAI embeddings model
- Two different Cloudflare Vectorize DBs (though you could add more!)
- Cloudflare Workers + Pages for hosting
- LangChain.js for orchestration
- Nuxt + Vue for the frontend

The two default data sources populated in `server/api/ingest.ts` are a [a PDF detailing some of Cloudflare's features](https://www.cloudflare.com/resources/assets/slt3lc6tev37/3HWObubm6fybC0FWUdFYAJ/5d5e3b0a4d9c5a7619984ed6076f01fe/Cloudflare_for_Campaigns_Security_Guide.pdf) and a [blog post by Lilian Weng](https://lilianweng.github.io/posts/2023-06-23-agent/) that talks about autonomous agents.

The bot will classify incoming questions as being about Cloudflare, AI, or neither, and draw on the corresponding data source for more targeted results. You can change the content of the ingested data if desired, but remember to update the chain and prompt under `utils/conversational_retrieval_chain.ts`.

## Setup

1. Install dependencies:

```bash
$ yarn
```

2. Create Vectorize DBs

Note that this currently requires you to be on a paid Cloudflare Workers plan.

We configure the databases to work with Cloudflare WorkersAI's `@cf/baai/bge-base-en-v1.5` embeddings model.

```bash
$ npx wrangler vectorize create langchain_cloudflare_knowledge --preset @cf/baai/bge-base-en-v1.5
$ npx wrangler vectorize create langchain_ai_knowledge --preset @cf/baai/bge-base-en-v1.5
```

See the [Wrangler CLI reference docs](https://developers.cloudflare.com/workers/wrangler/commands/#vectorize) for a full list of options.

3. Copy `.dev.vars.example` to `.dev.vars` and fill in the tokens.

4. Build project

```bash
$ yarn run build
```

5. Start in preview mode

```bash
$ yarn run preview
```

You can combine the previous two steps to reflect changes while developing (Nuxt hot reload coming soon!):

```bash
$ yarn run reload
```

6. Ping `http://localhost:3000/api/ingest` to populate the Vectorize DBs you set up earlier.

7. Go to `http://localhost:3000` and try asking a question about either Cloudflare or AI!
