'use babel';

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import voucher from 'voucher';
import { EventEmitter } from 'events';

export const config = {
  ninjaCommand: {
    title: 'Ninja command',
    description: 'Command to execute Ninja, must be either absolute path or reachable using PATH environment variable',
    type: 'string',
    default: 'ninja',
    order: 1
  },
  subdirs: {
    title: 'Build directories',
    description: 'List of project subdirectories to search for build.ninja file',
    type: 'array',
    default: ['src/out/Debug'],
    items: { type: 'string' },
    order: 2
  }
};

export function provideBuilder() {
  const gccErrorMatch = '(?<file>([A-Za-z]:[\\/])?[^:\\n]+):(?<line>\\d+):(?<col>\\d+):\\s*(fatal error|error|warning):\\s*(?<message>.+)';
  const errorMatch = [ gccErrorMatch ];

  return class NinjaBuildProvider extends EventEmitter {
    constructor(cwd) {
      super();
      this.cwd = cwd;
      atom.config.observe('build-make.subdirs', () => this.emit('refresh'));
      atom.config.observe('build-make.ninjaCommand', () => this.emit('refresh'));
    }

    getNiceName() {
      return 'Ninja';
    }

    isEligible() {
      this.dirs = atom.config.get('build-ninja.subdirs')
        .filter(d => fs.existsSync(path.join(this.cwd, d, 'build.ninja')));
      return this.dirs.length > 0;
    }

    settings() {
      console.log('settings');
      const addDirPrefix = this.dirs.length > 1;

      const promises = this.dirs.map(dir => {
        const buildDir = path.join(this.cwd, dir);
        const args = ['-C', buildDir, '-t', 'targets'];
        const ninjaCommand = atom.config.get('build-ninja.ninjaCommand');
        return voucher(execFile, ninjaCommand, args, { cwd: this.cwd }).then(output => {
          let targets = extractTargetNames(output);
          return targets.map(name => createTargetConfig(this.cwd, dir, name, ninjaCommand, addDirPrefix));
        }, error => {
          atom.notifications.addError(
              'Failed to fetch Ninja targets',
              { detail: `Can\'t execute \`${ninjaCommand}\` in \`${buildDir}\` directory: ${error}` });
        });
      });
      return Promise.all(promises).then(lists => [].concat(...lists));
    }
  };
}

function extractTargetNames(output) {
  const lines = output.split(/\n/);
  let targets = [];
  for (line of lines) {
    const m = /^([\w\d_]+): \w+$/.exec(line);
    if (m != null)
      targets.push(m[1]);
  }
  return targets;
}

function createTargetConfig(projectDir, dir, targetName, ninjaCommand, addDirPrefix) {
  if (addDirPrefix)
    targetName = dir + ': ' + targetName;
  const buildDir = path.join(projectDir, dir);

  return {
    exec: ninjaCommand,
    args: [targetName],
    cwd: buildDir,
    name: 'Ninja: ' + targetName,
    sh: false,
  };
}