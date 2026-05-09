require('dotenv/config');
const { default: OpenAI } = require('openai');
const router = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {'HTTP-Referer': 'http://localhost:3002', 'X-Title': 'probe'},
});
(async () => {
  console.log('Test 1: Claude haiku WITHOUT tools (baseline)');
  try {
    const r = await router.chat.completions.create({
      model: 'anthropic/claude-3.5-haiku',
      messages: [{role:'user', content:'Say hi in 5 words.'}],
      max_tokens: 50,
    });
    console.log('  ✓', r.choices[0]?.message?.content);
  } catch (e) { console.log('  ✗', e.message); }

  console.log('\nTest 2: Claude haiku WITH web_search_20250305 tool');
  try {
    const r = await router.chat.completions.create({
      model: 'anthropic/claude-3.5-haiku',
      messages: [{role:'user', content:'What is the weather today in NYC? Use web search.'}],
      max_tokens: 200,
      tools: [{type:'web_search_20250305', name:'web_search', max_uses:3}],
    });
    console.log('  status:', r.choices[0]?.finish_reason);
    console.log('  content:', JSON.stringify(r.choices[0]?.message?.content));
    console.log('  tool_calls:', JSON.stringify(r.choices[0]?.message?.tool_calls));
  } catch (e) { console.log('  ✗', e.status, e.message); }

  console.log('\nTest 3: Claude SONNET with web_search_20250305');
  try {
    const r = await router.chat.completions.create({
      model: 'anthropic/claude-sonnet-4.5',
      messages: [{role:'user', content:'What is the best productivity tool? Use web search.'}],
      max_tokens: 400,
      tools: [{type:'web_search_20250305', name:'web_search', max_uses:3}],
    });
    console.log('  ✓', r.choices[0]?.message?.content?.slice(0, 200));
  } catch (e) { console.log('  ✗', e.status, e.message); }

  console.log('\nTest 4: Claude haiku via :online shim');
  try {
    const r = await router.chat.completions.create({
      model: 'anthropic/claude-3.5-haiku:online',
      messages: [{role:'user', content:'What is the best productivity tool?'}],
      max_tokens: 400,
    });
    console.log('  ✓', r.choices[0]?.message?.content?.slice(0, 200));
  } catch (e) { console.log('  ✗', e.status, e.message); }
})();
