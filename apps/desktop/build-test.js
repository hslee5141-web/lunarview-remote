const { spawn } = require('child_process');
const path = require('path');

console.log('Starting build test...');

const build = spawn('npm.cmd', ['run', 'dist:win'], {
    cwd: __dirname,
    shell: true
});

build.stdout.on('data', (data) => {
    console.log(data.toString());
});

build.stderr.on('data', (data) => {
    console.error('ERROR:', data.toString());
});

build.on('close', (code) => {
    console.log(`Build process exited with code ${code}`);
});
