import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const name of readdirSync('dist').filter(n=>n.endsWith('.js'))){const result=spawnSync(process.execPath,['--check',`dist/${name}`],{encoding:'utf8'});if(result.status!==0){process.stderr.write(result.stderr);process.exit(1);}}
const html=readFileSync('dist/index.html','utf8');for(const [,file] of html.matchAll(/(?:src|href)="([a-z][a-z0-9.-]+\.(?:js|css|svg|webmanifest))"/g))if(!existsSync(`dist/${file}`))throw Error(`Missing local resource: ${file}`);
console.log('All browser modules parse and local resources exist.');
