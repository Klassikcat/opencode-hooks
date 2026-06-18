type InputEvent = {
    text: string;
};

type ExtensionAPI = {
    setLabel(label: string): void;
    on(event: "input", handler: (event: InputEvent) => Promise<{ text: string } | undefined>): void;
};

export default function nuPrefix(pi: ExtensionAPI) {
    pi.setLabel("Nushell prefix (>)");

    pi.on("input", async event => {
        const text = event.text;
        if (!text.startsWith(">")) return; // not nu mode — let core handle it
        const excluded = text.startsWith(">>");
        const code = (excluded ? text.slice(2) : text.slice(1)).trim();
        if (!code) return; // bare ">" / ">>": fall through, matching empty "!"/"$"
        // Single-quote for brush/POSIX parsing; escape embedded single quotes.
        const quoted = `'${code.replace(/'/g, "'\\''")}'`;
        // Rewrite to the existing bash prefix; the "!" branch runs `nu -c '...'`
        // with the full streaming/abort/recording UI. "!!" keeps it out of context.
        return { text: `${excluded ? "!!" : "!"}nu -c ${quoted}` };
    });
}
