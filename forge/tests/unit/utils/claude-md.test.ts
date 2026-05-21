import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { updateClaudeMd } from '../../../src/utils/claude-md';
import * as fs from 'fs';
import * as path from 'path';

describe('CLAUDE.md Update', () => {
  const testDir = path.join(__dirname, '../../tmp-claudemd');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should create CLAUDE.md if it does not exist', async () => {
    await updateClaudeMd(testDir, 'test-feature', {
      date: '2026-05-21',
      totalTasks: 6,
      completedTasks: 5,
      deferredTasks: [{ id: 6, title: 'Optional feature' }],
      testCoverage: 85,
    });

    const content = fs.readFileSync(path.join(testDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('test-feature');
    expect(content).toContain('Completed Features');
    expect(content).toContain('2026-05-21');
  });

  it('should append to existing CLAUDE.md without Forge section', async () => {
    fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), '# My Project\n\nSome content.');
    await updateClaudeMd(testDir, 'test-feature', {
      date: '2026-05-21',
      totalTasks: 6,
      completedTasks: 6,
      deferredTasks: [],
      testCoverage: 90,
    });

    const content = fs.readFileSync(path.join(testDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# My Project');
    expect(content).toContain('**Completed Features**');
    expect(content).toContain('test-feature');
  });

  it('should update existing Forge section', async () => {
    const existing = `# My Project

## Forge

**Completed Features**
- old-feature (2026-05-15)
  - Tasks: 4 completed
`;
    fs.writeFileSync(path.join(testDir, 'CLAUDE.md'), existing);
    await updateClaudeMd(testDir, 'new-feature', {
      date: '2026-05-21',
      totalTasks: 8,
      completedTasks: 8,
      deferredTasks: [],
      testCoverage: 92,
    });

    const content = fs.readFileSync(path.join(testDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('old-feature');
    expect(content).toContain('new-feature');
  });

  it('should list deferred tasks', async () => {
    await updateClaudeMd(testDir, 'partial-feature', {
      date: '2026-05-21',
      totalTasks: 6,
      completedTasks: 4,
      deferredTasks: [{ id: 5, title: 'Dark mode' }, { id: 6, title: 'Animations' }],
      testCoverage: 75,
    });

    const content = fs.readFileSync(path.join(testDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('Deferred');
    expect(content).toContain('Dark mode');
    expect(content).toContain('Animations');
  });
});
