<script setup lang="ts">
const messages = ref<Message[]>([]);
const chatMessages = ref<HTMLElement | null>(null);
const stopReceived = ref<boolean[]>([]);

const scrollHistoryToBottom = () => {
  if (chatMessages.value) {
    chatMessages.value.scrollTop = chatMessages.value.scrollHeight;
  }
};

const addNewMessage = (message: Message) => {
  messages.value.push(message);
  scrollHistoryToBottom();
  return messages.value.length - 1;
};

const appendToMessage = (chunk: string, index: number) => {
  let newContent = messages.value[index].content + chunk;
  // Hacky fix for WorkersAI duplicating the final token in output
  if (newContent.endsWith("..")) {
    newContent = newContent.slice(0, -1);
  }
  messages.value[index].content = newContent;
  scrollHistoryToBottom();
};

const getMessages = (): Message[] => {
  return messages.value;
};

const setMessages = (newMessages: Message[]) => {
  messages.value = newMessages;
};

const clearMessages = () => {
  messages.value = [];
};

defineExpose({
  addNewMessage,
  appendToMessage,
  getMessages,
  setMessages,
  clearMessages,
});
</script>

<template>
  <div ref="chatMessages" class="chat-messages">
    <ChatMessage
      v-for="message in messages.filter((m) => !!m.content)"
      :message="message"
    ></ChatMessage>
  </div>
</template>

<style scoped>
.chat-messages {
  display: flex;
  flex-direction: column;
  overflow: scroll;
  width: 100%;
}
</style>
