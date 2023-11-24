# Cloudflare + LangChain + Nuxt Multi-source Chatbot

This repo contains an example of a conversational retrieval system that can route between multiple data sources, choosing the one
more relevant to an incoming question. This helps cut down on distraction from off-topic documents getting
pulled in by the vectorstore's similarity search, which could occur if only a single database were used, and is particularly important for small models.

🚀 **Live version here:** https://langchain-cloudflare-nuxt-template.jacob-ee9.workers.dev/

The base version runs entirely on the Cloudflare WorkersAI stack with a tiny open-source Llama 2-7B model, but you can
swap in more powerful models such as OpenAI's `gpt-3.5-turbo` to improve performance in key places if desired. It uses:

- A chat variant of Llama 2-7B run via the [Cloudflare WorkersAI network](https://developers.cloudflare.com/workers-ai/)
- A Cloudflare WorkersAI embeddings model
- Two different [Cloudflare Vectorize DBs](https://developers.cloudflare.com/vectorize/) for different knowledge bases (you could add more!)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) for hosting
- [LangChain.js](https://js.langchain.com/) for orchestration
- [Nuxt](https://nuxt.com/) + [Vue](https://vuejs.org/) for the frontend

## How it works

Here's how it works:

0. The vectorstores are populated with ingested data via a local ping to the Nuxt server route under `/server/api/ingest.ts`.
1. An incoming question is routed to the Nuxt server route under `/server/api/chat.post.ts`. This route constructs and calls a [LangChain Expression Language](https://js.langchain.com/docs/expression_language/) chain located under `/utils/conversational_retrieval_chain.ts`.
2. If there have been previous messages in the conversation, the chain first transforms the original question into a _standalone question_, free of pronouns and other references to chat history. This is important since vectorstores return results based on similarity between ingested docs and the query.
3. Based on this rephrased query, the chain selects which vectorstore to retrieve from.
4. The chain retrieves context docs based on the output of the previous step from the chosen vectorstore.
5. The chain generates a final answer based on this retrieved context, the standalone question, and any chat history.

Here's an illustrative [LangSmith trace of the steps](https://smith.langchain.com/public/0474c554-01ab-4f7f-937f-b6c205fa91f5/r) involved.

Because we use a small model, removing as much distraction as possible via routing is even more helpful here.

The two default data sources populated in `server/api/ingest.ts` via [LangChain document loaders](https://js.langchain.com/docs/modules/data_connection/document_loaders/).
They are a [a PDF detailing some of Cloudflare's features](https://www.cloudflare.com/resources/assets/slt3lc6tev37/3HWObubm6fybC0FWUdFYAJ/5d5e3b0a4d9c5a7619984ed6076f01fe/Cloudflare_for_Campaigns_Security_Guide.pdf) and a [blog post by Lilian Weng](https://lilianweng.github.io/posts/2023-06-23-agent/) that talks about autonomous agents.

If you want to use alternate data sources, make sure to remember to also update the routing steps in the chain!

## Setup

### Install dependencies:

```bash
$ npm install
```

### Create Vectorize DBs

Note that this currently requires you to be on a paid Cloudflare Workers plan.

We configure the databases to work with Cloudflare WorkersAI's `@cf/baai/bge-base-en-v1.5` embeddings model.

```bash
$ npx wrangler vectorize create langchain_cloudflare_docs_index --preset @cf/baai/bge-base-en-v1.5
$ npx wrangler vectorize create langchain_ai_docs_index --preset @cf/baai/bge-base-en-v1.5
```

The names match those found in the default `wrangler.toml` file. If you choose different names, you will need to update the bindings there.

**Note:** If you want to delete your databases, you can run the following commands:

```bash
$ npx wrangler vectorize delete langchain_cloudflare_docs_index
$ npx wrangler vectorize delete langchain_ai_docs_index
```

You can use other presets or parameters for other embedding models.
See the [Wrangler CLI reference docs](https://developers.cloudflare.com/workers/wrangler/commands/#vectorize) for a full list of options.

### Set up required env vars

Copy `.dev.vars.example` to `.dev.vars` and fill in the required variables:

```ini
# https://dash.cloudflare.com/
CLOUDFLARE_ACCOUNT_ID=

# https://developers.cloudflare.com/workers-ai/get-started/rest-api/
CLOUDFLARE_WORKERSAI_API_TOKEN=

# For tracing via LangSmith
# https://docs.smith.langchain.com/
LANGCHAIN_TRACING_V2=
LANGCHAIN_SESSION=
LANGCHAIN_API_KEY=

# If swapping in OpenAI somewhere, https://platform.openai.com/api-keys
OPENAI_API_KEY=

ENVIRONMENT="local"
```

### Build project

```bash
$ npm run build
```

### Start in preview mode

```bash
$ npm run preview
```

You can combine the previous two steps to reflect changes while developing (Nuxt hot reload coming soon!):

```bash
$ npm run reload
```

### Ingestion

Ping `http://localhost:3000/api/ingest` to populate the Vectorize DBs you set up earlier.

And finally, go to `http://localhost:3000` and try asking a question about either Cloudflare or AI!

## Deployment

When you're ready, deploy to Cloudflare workers via Wrangler with:

```bash
$ npm run deploy
```

You'll need to set private encrypted environment variables in your Cloudflare console under your Worker's `Settings -> Variables` page for `CLOUDFLARE_WORKERSAI_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `LANGCHAIN_API_KEY` if using tracing:

![](/public/images/cloudflare-env-vars.png)

## Customization

By default, the only APIs and resources this app uses are within Cloudflare. However, by leveraging OpenAI's best-in-class private models at key points
in the retrieval chain, we can drastically improve performance without using an excessive number of tokens.

The two places where this increased reasoning power are most helpful are in the question rephrase step and the routing step, and coincidentally,
both steps are lighter on tokens because they do not involve passing a large list of retrieved docs as context.

## Thank you!

For more, follow LangChain on X (formerly Twitter) [@LangChainAI](https://x.com/langchainai/).
