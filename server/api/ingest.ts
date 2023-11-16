import { CheerioWebBaseLoader } from "langchain/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import { CloudflareVectorizeStore } from "langchain/vectorstores/cloudflare_vectorize";
import { CloudflareWorkersAIEmbeddings } from "langchain/embeddings/cloudflare_workersai";

export default defineEventHandler(async (event) => {
  if (process.env.ENVIRONMENT !== "local") {
    throw new Error(`You must run the ingest script with process.env.ENVIRONMENT set to "local".`);
  }
  const cloudflareBindings = event.context?.cloudflare?.env;
  if (!cloudflareBindings) {
    throw new Error("No Cloudflare bindings found.");
  }
  const embeddings = new CloudflareWorkersAIEmbeddings({
    binding: cloudflareBindings.AI,
    modelName: "@cf/baai/bge-base-en-v1.5",
  });
  const vectorstore = new CloudflareVectorizeStore(embeddings, {
    index: cloudflareBindings.VECTORIZE_INDEX,
  });
  const loader = new CheerioWebBaseLoader(
    "https://lilianweng.github.io/posts/2023-06-23-agent/"
  );
  const docs = await loader.load();
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 100,
  });
  const splitDocs = await splitter.splitDocuments(docs);
  const ids = [];
  const encoder = new TextEncoder();
  for (const doc of splitDocs) {
    // Vectorize does not support object metadata.
    doc.metadata = {};
    const insecureHash = await crypto.subtle.digest("SHA-1", encoder.encode(doc.pageContent));
    const hashArray = Array.from(new Uint8Array(insecureHash));
    const readableId = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    ids.push(readableId);
  }
  await vectorstore.addDocuments(splitDocs, { ids });
  return "Ingest complete!";
});