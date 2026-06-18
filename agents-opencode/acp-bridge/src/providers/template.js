export function parseArgsTemplate(template, prompt) {
  return template
    .split(" ")
    .filter(Boolean)
    .map((part) => (part === "{prompt}" ? prompt : part));
}
