import { WebPDFLoader } from "langchain/document_loaders/web/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Document } from "@langchain/core/documents";
import type { VectorStore } from "@langchain/core/vectorstores";

import {
  CloudflareVectorizeStore,
  CloudflareWorkersAIEmbeddings,
} from "@langchain/cloudflare";

import { BLOG_POST_TEXT } from "~/utils/data/lilian_weng_agents_blog";

const upsertDocsToVectorstore = async (
  vectorstore: VectorStore,
  docs: Document[],
) => {
  const ids = [];
  const encoder = new TextEncoder();
  for (const doc of docs) {
    // Vectorize does not support object metadata, and we won't be needing it for
    // this app.
    doc.metadata = {};
    const insecureHash = await crypto.subtle.digest(
      "SHA-1",
      encoder.encode(doc.pageContent),
    );
    // Use a hash of the page content as an id
    const hashArray = Array.from(new Uint8Array(insecureHash));
    const readableId = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    ids.push(readableId);
  }
  const result = await vectorstore.addDocuments(docs, { ids });
  return result;
};

export default defineEventHandler(async (event) => {
  if (process.env.ENVIRONMENT !== "local") {
    throw new Error(
      `You must run the ingest script with process.env.ENVIRONMENT set to "local".`,
    );
  }
  const cloudflareBindings = event.context?.cloudflare?.env;
  if (!cloudflareBindings) {
    throw new Error("No Cloudflare bindings found.");
  }
  const embeddings = new CloudflareWorkersAIEmbeddings({
    binding: cloudflareBindings.AI,
    modelName: "@cf/baai/bge-base-en-v1.5",
  });

  // Tune based on your raw content.
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1024,
    chunkOverlap: 100,
  });

  // Ingest content from a blog post on AI agents
  const aiAgentDocument = new Document({
    pageContent: BLOG_POST_TEXT,
  });
  const splitAiAgentDocs = await splitter.splitDocuments([aiAgentDocument]);
  const aiKnowledgeVectorstore = new CloudflareVectorizeStore(embeddings, {
    index: cloudflareBindings.AI_KNOWLEDGE_VECTORIZE_INDEX,
  });

  await upsertDocsToVectorstore(aiKnowledgeVectorstore, splitAiAgentDocs);

  // Ingest content about Cloudflare
  // Need to polyfill a method that Cloudflare Workers is missing for the PDF loader
  globalThis.setImmediate = ((fn: () => {}) => setTimeout(fn, 0)) as any;
  const cloudflareFetchResponse = await fetch(
    "https://www.cloudflare.com/resources/assets/slt3lc6tev37/3HWObubm6fybC0FWUdFYAJ/5d5e3b0a4d9c5a7619984ed6076f01fe/Cloudflare_for_Campaigns_Security_Guide.pdf",
  );
  const cloudflarePdfBlob = await cloudflareFetchResponse.blob();
  const pdfLoader = new WebPDFLoader(cloudflarePdfBlob, {
    parsedItemSeparator: "",
  });
  const cloudflareDocs = await pdfLoader.load();
  const splitCloudflareDocs = await splitter.splitDocuments(cloudflareDocs);
  const cloudflareKnowledgeVectorstore = new CloudflareVectorizeStore(
    embeddings,
    {
      index: cloudflareBindings.CLOUDFLARE_KNOWLEDGE_VECTORIZE_INDEX,
    },
  );
  await upsertDocsToVectorstore(
    cloudflareKnowledgeVectorstore,
    splitCloudflareDocs,
  );

  return "Ingest complete!";
});
