<script lang="ts">
export interface Message {
  type: "human" | "ai";
  content: string;
}
</script>

<script setup lang="ts">
const props = defineProps<{
  message: Message;
}>();
</script>

<template>
  <div class="message-container" :class="props.message.type">
    {{ props.message.content.trim() }}
  </div>
</template>

<style scoped>
.message-container {
  border-radius: 4px;
  padding: 4px 8px;
  max-width: 75%;
  margin-bottom: 24px;
  text-align: left;
  white-space: pre-wrap;
}
.message-container.human {
  background-color: var(--color-white);
  color: var(--color-black);
  margin-left: auto;
}
.message-container.ai {
  background-color: var(--color-blue);
  margin-right: auto;
}
</style>
