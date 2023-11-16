import type { VectorStore } from "langchain/vectorstores/base";
import type { BaseLanguageModel } from "langchain/base_language";

import { ChatPromptTemplate } from "langchain/prompts";
import { RunnableSequence, RunnableBranch } from "langchain/schema/runnable";
import { StringOutputParser } from "langchain/schema/output_parser";
import { formatDocumentsAsString } from "langchain/util/document";

const CONDENSE_QUESTION_TEMPLATE = `Given the following conversation and a follow up question, rephrase the follow up question to be a standalone question.

Do not respond with anything other than a rephrased standalone question.

Chat History:
{chat_history}
Follow Up Input: {question}
Standalone Question:`;
const condenseQuestionPrompt = ChatPromptTemplate.fromTemplate(
  CONDENSE_QUESTION_TEMPLATE,
);

const ANSWER_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources. Using the provided context, answer the user's question to the best of your ability using the resources provided.
Generate a concise answer for a given question based solely on the provided context. You must only use information from the provided search results. Use an unbiased and journalistic tone. Combine search results together into a coherent answer. Do not repeat text.
If there is nothing in the context relevant to the question at hand, just say "Hmm, I'm not sure." Don't try to make up an answer.
Anything between the following \`context\` html blocks is retrieved from a knowledge bank, not part of the conversation with the user.

<context>
  {context}
<context/>

You may also use the following chat history as context:

<chat_history>
  {chat_history}
</chat_history>

REMEMBER: If there is no relevant information within the context, just say "Hmm, I'm not sure." Don't try to make up an answer.

Now, answer this question: {standalone_question}`;

const answerPrompt = ChatPromptTemplate.fromTemplate(ANSWER_TEMPLATE);

const ROUTER_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources.
You have access to two databases: one with information about Cloudflare, and another about artificial intelligence. 
Your job is to pick the database that would be more useful to answer the following question:

<question>
  {standalone_question}
</question>

You must respond with one of the following answers: "Cloudflare", "Artificial Intelligence", or "Neither". Do not include anything else in your response.

Response:`;

const routerPrompt = ChatPromptTemplate.fromTemplate(ROUTER_TEMPLATE);

export function createConversationalRetrievalChain({
  model,
  cloudflareKnowledgeVectorstore,
  aiKnowledgeVectorstore,
}: {
  model: BaseLanguageModel;
  cloudflareKnowledgeVectorstore: VectorStore;
  aiKnowledgeVectorstore: VectorStore;
}) {
  const cloudflareKnowledgeRetriever = cloudflareKnowledgeVectorstore
    .asRetriever()
    .withConfig({ runName: "CloudflareKnowledgeRetriever" });
  const aiKnowledgeRetriever = aiKnowledgeVectorstore
    .asRetriever()
    .withConfig({ runName: "AIKnowledgeRetriever" });

  const standaloneQuestionChain = RunnableSequence.from([
    {
      question: (input) => input.question,
      chat_history: (input) => input.chat_history,
    },
    condenseQuestionPrompt,
    model,
    new StringOutputParser(),
  ]).withConfig({ runName: "RephraseQuestionChain" });

  const routingChain = RunnableSequence.from([
    routerPrompt,
    model,
    new StringOutputParser(),
  ]).withConfig({ runName: "RoutingChain" });

  const retrievalChain = RunnableSequence.from([
    {
      standalone_question: (input) => input.standalone_question,
      knowledge_base_name: routingChain,
    },
    // Default to the AI retriever if the model does not think Cloudflare would be helpful.
    // You could change this to a general search retriever instead.
    RunnableBranch.from([
      [
        (output) =>
          output.knowledge_base_name.toLowerCase().includes("cloudflare"),
        RunnableSequence.from([
          (output) => output.standalone_question,
          cloudflareKnowledgeRetriever,
        ]),
      ],
      RunnableSequence.from([
        (output) => output.standalone_question,
        aiKnowledgeRetriever,
      ]),
    ]),
    formatDocumentsAsString,
  ]).withConfig({ runName: "RetrievalChain" });

  const answerChain = RunnableSequence.from([
    {
      standalone_question: (input) => input.standalone_question,
      chat_history: (input) => input.chat_history,
      context: retrievalChain,
    },
    answerPrompt,
    model,
  ]).withConfig({ runName: "AnswerGenerationChain" });

  return RunnableSequence.from([
    {
      standalone_question: standaloneQuestionChain,
      chat_history: (input) => input.chat_history,
    },
    answerChain,
  ]).withConfig({ runName: "ConversationalRetrievalChain" });
}
