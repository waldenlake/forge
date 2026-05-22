/**
 * Forge plugin for OpenCode.ai
 *
 * Injects forge bootstrap context via message transform.
 * Auto-registers skills directory via config hook (no symlinks needed).
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Strip YAML frontmatter from SKILL.md content, return body only
const stripFrontmatter = (content) => {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1] : content;
};

// Module-level cache for bootstrap content
let _bootstrapCache = undefined;

// Stable marker for guard logic (won't break if SKILL.md content changes)
const FORGE_BOOTSTRAP_MARKER = '<!-- forge-bootstrap-injected -->';

export const ForgePlugin = async ({ client, directory }) => {
  const forgeSkillsDir = path.resolve(__dirname, '../../skills');

  // Helper to generate bootstrap content (cached after first call)
  const getBootstrapContent = () => {
    if (_bootstrapCache !== undefined) return _bootstrapCache;

    const skillPath = path.join(forgeSkillsDir, 'using-forge', 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      _bootstrapCache = null;
      return null;
    }

    const fullContent = fs.readFileSync(skillPath, 'utf8');
    const content = stripFrontmatter(fullContent);

    const toolMapping = `

**Tool Mapping for OpenCode:**
When skills reference tools you don't have, substitute OpenCode equivalents:
- \`TodoWrite\` → \`todowrite\`
- \`Task\` tool with subagents → Use OpenCode's subagent system (@mention)
- \`Skill\` tool → OpenCode's native \`skill\` tool
- \`Read\`, \`Write\`, \`Edit\`, \`Bash\` → Your native tools

Use OpenCode's native \`skill\` tool to list and load skills.`;

    _bootstrapCache = `${FORGE_BOOTSTRAP_MARKER}
<IMPORTANT>
You have the Forge orchestration plugin installed.

**IMPORTANT: The using-forge skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT use the skill tool to load "using-forge" again.**

${content}
${toolMapping}
</IMPORTANT>`;

    return _bootstrapCache;
  };

  return {
    // Inject skills path into live config so OpenCode discovers forge skills
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(forgeSkillsDir)) {
        config.skills.paths.push(forgeSkillsDir);
      }
    },

    // Inject bootstrap into the first user message of each session
    'experimental.chat.messages.transform': async (_input, output) => {
      const bootstrap = getBootstrapContent();
      if (!bootstrap || !output.messages.length) return;

      const firstUser = output.messages.find(m => m.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;

      // Guard: skip if already injected (use stable marker, not content string)
      if (firstUser.parts.some(p => p.type === 'text' && p.text.includes(FORGE_BOOTSTRAP_MARKER))) return;

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
    }
  };
};
