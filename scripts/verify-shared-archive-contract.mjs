#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd(); const failures=[]
function read(relativePath){const full=path.join(root,relativePath);if(!fs.existsSync(full)||!fs.statSync(full).isFile()){failures.push(`Missing required file: ${relativePath}`);return ''}return fs.readFileSync(full,'utf8').replace(/\r\n/g,'\n')}
function requireMatch(text,pattern,message){if(!pattern.test(text))failures.push(message)}
function forbidMatch(text,pattern,message){if(pattern.test(text))failures.push(message)}
function listFiles(directory,predicate){const target=path.join(root,directory);return fs.existsSync(target)?fs.readdirSync(target).filter(predicate).sort():[]}
function planCount(sql,file){const matches=[...sql.matchAll(/\bselect\s+plan\s*\(\s*(\d+)\s*\)/gi)];if(matches.length!==1){failures.push(`${file} must contain exactly one literal pgTAP plan.`);return 0}return Number(matches[0][1])}

const packageJson=JSON.parse(read('package.json')||'{}')
const workflow=read('.github/workflows/quality.yml')
const contract=read('docs/wbs-2.1/contract-and-scope.md')
read('docs/wbs-2.1/acceptance-evidence-template.md');read('docs/wbs-2.1/third-party-review-package-template.md')
const migrations=listFiles('supabase/migrations',(name)=>/^\d{14}_wbs_2_1_account_store_model\.sql$/.test(name))
if(migrations.length!==1)failures.push(`Expected one WBS 2.1 migration, found ${migrations.length}.`)
const migration=migrations.length===1?read(`supabase/migrations/${migrations[0]}`):''
const expectedTests=['0030_wbs_2_1_account_store_schema.sql','0031_wbs_2_1_shared_archive_rls.sql']
const actualTests=listFiles('supabase/tests',(name)=>/^003\d_wbs_2_1_.*\.sql$/.test(name))
if(actualTests.join('|')!==expectedTests.join('|'))failures.push(`WBS 2.1 test set must be exactly: ${expectedTests.join(', ')}.`)
let planned=0;for(const file of expectedTests)planned+=planCount(read(`supabase/tests/${file}`),`supabase/tests/${file}`)
if(planned<72)failures.push(`WBS 2.1 must plan at least 72 pgTAP assertions; found ${planned}.`)
if(packageJson.scripts?.['verify:shared-archive']!=='node scripts/verify-shared-archive-contract.mjs')failures.push('package.json must expose verify:shared-archive.')
if(!/(?:^|&&\s*)npm\s+run\s+verify:shared-archive(?:\s*&&|\s*$)/.test(packageJson.scripts?.check??''))failures.push('The aggregate check script must run verify:shared-archive.')
requireMatch(workflow,/- name: Verify shared archive contract\n\s+run: npm run verify:shared-archive/,'Quality must run the WBS 2.1 static verifier.')
for(const table of ['accounts','stores']){
  requireMatch(migration,new RegExp(`create\\s+table\\s+public\\.${table}\\b`,'i'),`Migration must create public.${table}.`)
  requireMatch(migration,new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,'i'),`${table} must enable RLS.`)
  requireMatch(migration,new RegExp(`alter\\s+table\\s+public\\.${table}\\s+force\\s+row\\s+level\\s+security`,'i'),`${table} must force RLS.`)
  requireMatch(migration,new RegExp(`revoke\\s+all\\s+on\\s+table\\s+public\\.${table}\\s+from\\s+public,\\s*anon,\\s*authenticated,\\s*service_role`,'i'),`${table} must revoke all Data API roles.`)
  requireMatch(migration,new RegExp(`grant\\s+select\\s+on\\s+table\\s+public\\.${table}\\s+to\\s+authenticated,\\s*service_role`,'i'),`${table} must grant SELECT only.`)
  forbidMatch(migration,new RegExp(`grant\\s+(?:all|insert|update|delete|truncate)[^;]*public\\.${table}`,'i'),`${table} must not grant writes.`)
}
for(const column of ['public_id','name','name_normalized','status','status_reason','status_changed_at','created_by_member_id','updated_by_member_id','created_at','updated_at','version'])requireMatch(migration,new RegExp(`\\b${column}\\b`,'i'),`Migration must define ${column}.`)
requireMatch(migration,/account_id\s+bigint\s+not\s+null[\s\S]*references\s+public\.accounts\s*\(id\)\s+on\s+delete\s+restrict/i,'stores.account_id must restrict deletion.')
forbidMatch(migration,/create\s+table\s+public\.(?:accounts|stores)[\s\S]{0,1800}\bdepartment_id\b/i,'Shared archive tables must not embed department_id.')
requireMatch(migration,/using\s*\(\(select\s+app_private\.current_member_id\(\)\)\s+is\s+not\s+null\)/i,'Shared reads must use the live member helper.')
for(const marker of ['ACCOUNT_IDENTITY_IMMUTABLE','STORE_IDENTITY_IMMUTABLE','ACCOUNT_DELETE_FORBIDDEN','STORE_DELETE_FORBIDDEN'])requireMatch(migration,new RegExp(marker),`Missing immutable marker ${marker}.`)
for(const index of ['accounts_name_normalized_idx','accounts_status_updated_idx','accounts_created_by_member_id_idx','accounts_updated_by_member_id_idx','stores_account_status_idx','stores_name_normalized_idx','stores_status_updated_idx','stores_created_by_member_id_idx','stores_updated_by_member_id_idx'])requireMatch(migration,new RegExp(`create\\s+index\\s+${index}\\b`,'i'),`Missing required index ${index}.`)
forbidMatch(contract,/\b(?:contacts|portrait_values|department_opportunities)\b.*(?:create|implement)/i,'WBS 2.1 contract must not implement later-scope tables.')
if(failures.length){console.error(`WBS 2.1 shared archive contract verification failed (${failures.length}).`);for(const failure of failures)console.error(`- ${failure}`);process.exit(1)}
console.log(`WBS 2.1 shared archive contract verification passed (${planned} planned assertions).`)
