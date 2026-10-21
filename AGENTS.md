<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Jarvis chat streams through `src/routes/api/chat.ts` -> `src/lib/ai/chat.server.ts`; it verifies the bearer token and thread ownership itself, and saves full UIMessage[] to `threads.messages` in onFinish. Why: one server boundary for model calls, tools and persistence.
- Generated images live in the private `jarvis-images` bucket under `<userId>/`; tool outputs store only the path and the client signs URLs. Why: keeps base64 out of chat history sent back to the model.
- Voice uses the browser's speech recognition/synthesis (es-MX). Why: free and instant; swap for gateway STT/TTS if higher quality is needed.
