# agent-skills

A collection of [Agent Skills](https://agentskills.io/specification) — self-contained instruction packages that an LLM agent loads on demand. Each skill is a folder with a `SKILL.md` (frontmatter + instructions), plus a small helper script where useful. Claude Code, Pi, and other agent harnesses already read this same format natively.

## Skills in this repo

| Skill | What it does |
|---|---|
| [`checkpointed-delegation`](checkpointed-delegation/SKILL.md) | For Claude Code: offload mechanical execution to a cheap OpenRouter model via Pi (Opus/Fable 5 keeps planning and review), so only planning burns subscription quota. Checkpointed chunks catch the cheap model's drift mid-run instead of only at the end. |
| [`flesch-kincaid`](flesch-kincaid/SKILL.md) | Scores a draft's reading grade with a real Flesch-Kincaid formula and loops simplification passes until it hits a target grade. Includes `fk_score.py`, no dependencies beyond Python 3. |
| [`zmail-cli`](zmail-cli/SKILL.md) | Drives a specific local Zoho Mail CLI tool. Tied to one person's machine and account — read it as a worked example of documenting a finicky local tool, not something you can run as-is. |

## Getting the files

Clone it:

```sh
git clone https://github.com/alvee1994/agent-skills.git
```

Or grab one skill without the rest of the repo (no git required):

```sh
curl -L https://github.com/alvee1994/agent-skills/archive/refs/heads/main.tar.gz \
  | tar -xz --strip-components=2 agent-skills-main/flesch-kincaid
```

Or use the green **Code → Download ZIP** button on the GitHub repo page, then unzip locally.

## Using a skill

### Claude Code (CLI)

Claude Code loads skills from `~/.claude/skills/`. Clone straight into a subfolder there, or symlink individual skills in:

```sh
git clone https://github.com/alvee1994/agent-skills.git ~/codeStuff/agent-skills
ln -s ~/codeStuff/agent-skills/flesch-kincaid ~/.claude/skills/flesch-kincaid
```

Restart Claude Code, or start a new session. Then invoke with `/flesch-kincaid 6-8`, or just ask for the task — Claude Code reads the skill list at startup and pulls in the matching one on its own.

### Pi (CLI)

Same skill format, different discovery paths. Either clone into `~/.pi/agent/skills/`, or point `~/.pi/agent/settings.json` at this repo:

```json
{
  "skills": ["/absolute/path/to/agent-skills"]
}
```

Then `/skill:flesch-kincaid 6-8` inside a `pi` session.

### Claude.ai / Claude Desktop (web or app)

Claude's Skills feature (Settings → Capabilities → Skills) takes a `.zip` with `SKILL.md` at its root. Zip one skill folder, then upload it:

```sh
cd agent-skills/flesch-kincaid && zip -r ../flesch-kincaid.zip .
```

Upload `flesch-kincaid.zip` in Settings → Capabilities → Skills → Upload skill. It's then available in any conversation.

### ChatGPT (web)

ChatGPT has no native Agent Skills support, but a Custom GPT gets you the same result:

1. **Explore → Create a GPT → Configure.**
2. Paste the body of `SKILL.md` (everything after the `---` frontmatter block) into the **Instructions** field.
3. If the skill ships a script (e.g. `fk_score.py`), upload it under **Knowledge** and enable **Code Interpreter** so the GPT can run it.
4. Save, then just describe the task in chat — the custom instructions apply automatically.

No Custom GPT access (e.g. on a free plan)? Paste the `SKILL.md` body directly into a message before your actual request. Any chat model will follow it for that conversation — it just won't persist across sessions.

### Perplexity (web)

Create a **Space** (sidebar → Spaces → Create Space), and in its settings:

1. Paste the body of `SKILL.md` into **Custom Instructions**.
2. Upload any helper script (e.g. `fk_score.py`) as a **File** in the Space so it's available for reference.
3. Ask your questions inside that Space — the instructions apply to every thread in it.

### Any other chat interface

The fallback that works everywhere: open `SKILL.md`. Copy everything below the frontmatter. Paste it at the top of your message, then add your actual request underneath.

## License

[Unlicense](UNLICENSE) — public domain. Use any of this however you want, no attribution needed.
