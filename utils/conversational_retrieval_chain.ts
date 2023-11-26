import type { VectorStore } from "langchain/vectorstores/base";
import type { BaseLanguageModel } from "langchain/base_language";
import type { Document } from "langchain/document";

import { ChatPromptTemplate } from "langchain/prompts";
import { RunnableSequence, RunnableBranch } from "langchain/schema/runnable";
import { StringOutputParser } from "langchain/schema/output_parser";

const CONDENSE_QUESTION_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources.
Your job is to remove references to chat history from incoming questions, rephrasing them as standalone questions.
The exception is if the question is directly asking about the conversation. In this case, just return the original question.

Here is the prior chat history:

<chat_history>
{chat_history}
</chat_history>

Now, convert the following question to be an dereferenced question that keeps the exact meaning of the original question, but is free of references to the chat history.

Do not respond with anything other than a rephrased standalone question. Be concise.

Question: {question}
Standalone question:`;

// This is equivalent to a human message
const condenseQuestionPrompt = ChatPromptTemplate.fromTemplate(CONDENSE_QUESTION_TEMPLATE);

const ROUTER_TEMPLATE = `You are an experienced researcher, expert at interpreting and answering questions based on provided sources.
You have access to two databases: one with information about Cloudflare, and another about artificial intelligence. 
Your job is to pick the database that would be more useful to answer the following question:

<question>
{standalone_question}
</question>

You must respond with only one following answers: "Cloudflare", "Artificial Intelligence", or "Neither". Do not include anything else in your response.

Answer:`;

const routerPrompt = ChatPromptTemplate.fromTemplate(ROUTER_TEMPLATE);

const ANSWER_TEMPLATE = `You are an AI assistant, skilled at interpreting and answering questions based on provided sources.
You are having a conversation with a human.
Using the provided context, answer the user's question to the best of your ability using only the resources provided.
Use bullet points for readability when possible.
You must only use information from the provided context. Use an unbiased and journalistic tone, but use as much detail as you have available. Do not repeat text.

You must always use the following format. Pay close attention to it:

Question: The human's question
Answer: Your generated answer, using only facts from the previously provided context
STOP: Stop generating!

Anything between the following \`context\` html blocks is provided context from a knowledge bank, not part of the conversation with the user.

<context>
{context}
</context>

Now, answer the following question to the best of your ability. 
REMEMBER: Only answer the human's question directly, and add "STOP:" after each answer.

Question: {standalone_question}
Answer:`;

const answerPrompt = ChatPromptTemplate.fromTemplate(ANSWER_TEMPLATE);

const formatDocuments = (docs: Document[]) => {
  return docs.map((doc, i) => {
    return `<doc>\n${doc.pageContent}\n</doc>`;
  }).join("\n");
};

export function createConversationalRetrievalChain({
  model,
  largerModel,
  cloudflareKnowledgeVectorstore,
  aiKnowledgeVectorstore,
}: {
  model: BaseLanguageModel;
  largerModel?: BaseLanguageModel;
  cloudflareKnowledgeVectorstore: VectorStore;
  aiKnowledgeVectorstore: VectorStore;
}) {
  const cloudflareKnowledgeRetriever = cloudflareKnowledgeVectorstore
    .asRetriever({ k: 3 })
    .withConfig({ runName: "CloudflareKnowledgeRetriever" });
  const aiKnowledgeRetriever = aiKnowledgeVectorstore
    .asRetriever({ k: 3 })
    .withConfig({ runName: "AIKnowledgeRetriever" });

  const routingChain = RunnableSequence.from([
    routerPrompt,
    largerModel ?? model,
    new StringOutputParser(),
  ]).withConfig({ runName: "RoutingChain" });

  const retrievalChain = RunnableSequence.from([
    {
      standalone_question: (input) => input.standalone_question,
      knowledge_base_name: routingChain,
    },
    // Default to the AI retriever if the model does not think Cloudflare would be helpful.
    // You could change this to e.g. a general search retriever instead.
    RunnableBranch.from([
      [
        (output) =>
          output.knowledge_base_name.toLowerCase().includes("cloudflare"),
        RunnableSequence.from([
          // Retrievers only take a single string as input,
          // so we have to extract it from the previous step output.
          (output) => output.standalone_question,
          cloudflareKnowledgeRetriever,
        ]),
      ],
      RunnableSequence.from([
        (output) => output.standalone_question,
        aiKnowledgeRetriever,
      ]),
    ]),
    formatDocuments,
  ]).withConfig({ runName: "RetrievalChain" });

  const standaloneQuestionChain = RunnableSequence.from([
    condenseQuestionPrompt,
    largerModel ?? model,
    new StringOutputParser(),
  ]).withConfig({ runName: "RephraseQuestionChain" });

  const answerChain = RunnableSequence.from([
    {
      standalone_question: (input) => input.standalone_question,
      chat_history: (input) => input.chat_history,
      context: retrievalChain,
    },
    answerPrompt,
    model,
  ]).withConfig({ runName: "AnswerGenerationChain" });

  /**
   * Chain steps are:
   * 1. If there is chat history, rephrase initial question as standalone question with standaloneQuestionChain
   *   If question is not a followup, pass the user's question directly through
   * 2. Choose proper vectorstore based on the question using routingChain
   * 3. Retrieve context docs based on the output of routingChain using retrievalChain
   * 4. Generate a final answer based on context, question, and chat history in answerChain
   *
   * Illustrative trace:
   * https://smith.langchain.com/public/0474c554-01ab-4f7f-937f-b6c205fa91f5/r
   */
  return RunnableSequence.from([
    {
      standalone_question: RunnableBranch.from([
        [(input) => input.chat_history.length > 0, standaloneQuestionChain],
        (input) => input.question,
      ]),
      chat_history: (input) => input.chat_history,
    },
    answerChain,
  ]).withConfig({ runName: "ConversationalRetrievalChain" });
}
