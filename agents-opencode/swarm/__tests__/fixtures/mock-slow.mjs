#!/usr/bin/env node

setTimeout(() => {
  console.log(JSON.stringify({ response: "slow fixture response" }));
}, 1000);
