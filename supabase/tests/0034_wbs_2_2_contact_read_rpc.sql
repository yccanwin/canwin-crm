begin;

select plan(46);

create temporary table wbs_2_2_contact_rpc_results (
  label text primary key,
  result jsonb not null
);
grant insert, select on table wbs_2_2_contact_rpc_results to authenticated;

insert into public.departments(id,code,name,status) overriding system value values
(2241,'contact-rpc','Contact RPC Department','active'),
(2242,'contact-rpc-off','Contact RPC Inactive','inactive');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change_token_new,email_change)
select '00000000-0000-0000-0000-000000000000',user_id,'authenticated','authenticated',email,'',now(),now(),now(),'{}','{}','','','','' from(values
('00000000-0000-4000-8000-000000002241'::uuid,'contact-rpc-sales@example.test'),
('00000000-0000-4000-8000-000000002242'::uuid,'contact-rpc-manager@example.test'),
('00000000-0000-4000-8000-000000002243'::uuid,'contact-rpc-admin@example.test'),
('00000000-0000-4000-8000-000000002244'::uuid,'contact-rpc-disabled@example.test'),
('00000000-0000-4000-8000-000000002245'::uuid,'contact-rpc-department-off@example.test'),
('00000000-0000-4000-8000-000000002246'::uuid,'contact-rpc-stale@example.test'))as fixture(user_id,email);

insert into auth.sessions(id,user_id,created_at,updated_at) values
('24000000-0000-4000-8000-000000002241','00000000-0000-4000-8000-000000002241',now(),now()),
('24000000-0000-4000-8000-000000002242','00000000-0000-4000-8000-000000002242',now(),now()),
('24000000-0000-4000-8000-000000002243','00000000-0000-4000-8000-000000002243',now(),now()),
('24000000-0000-4000-8000-000000002244','00000000-0000-4000-8000-000000002244',now(),now()),
('24000000-0000-4000-8000-000000002245','00000000-0000-4000-8000-000000002245',now(),now());

insert into public.members(id,auth_user_id,primary_department_id,role,status,accepted_at,disabled_at,disabled_by_member_id,disabled_reason) overriding system value values
(2241,'00000000-0000-4000-8000-000000002241',2241,'sales','active',now(),null,null,null),
(2242,'00000000-0000-4000-8000-000000002242',2241,'department_manager','active',now(),null,null,null),
(2243,'00000000-0000-4000-8000-000000002243',2241,'super_admin','active',now(),null,null,null),
(2244,'00000000-0000-4000-8000-000000002244',2241,'sales','disabled',now(),now(),2243,'Synthetic disabled member'),
(2245,'00000000-0000-4000-8000-000000002245',2242,'sales','active',now(),null,null,null),
(2246,'00000000-0000-4000-8000-000000002246',2241,'super_admin','active',now(),null,null,null);

insert into public.accounts(id,public_id,name,created_by_member_id,updated_by_member_id) overriding system value values
(2241,'24000000-0000-4000-8000-000000000001','Synthetic RPC Account',2243,2243);
insert into public.stores(id,public_id,account_id,name,created_by_member_id,updated_by_member_id) overriding system value values
(2241,'24000000-0000-4000-8000-000000000002',2241,'Synthetic RPC Store',2243,2243);
insert into public.contacts(id,public_id,store_id,role_label,status,status_reason,created_by_member_id,updated_by_member_id) overriding system value values
(2241,'24000000-0000-4000-8000-000000000003',2241,'Decision Maker','active',null,2243,2243),
(2242,'24000000-0000-4000-8000-000000000004',2241,'No Channels','active',null,2243,2243),
(2243,'24000000-0000-4000-8000-000000000005',2241,'Inactive Contact','inactive','Synthetic inactive contact',2243,2243);
insert into app_private.contact_secrets(contact_id,full_name,mobile,phone,email,wechat,other,created_by_member_id,updated_by_member_id)
values(2241,'Synthetic RPC Person','00000000000','555-0100','rpc-person@example.test','rpc_wechat','Synthetic alternate channel',2243,2243);

set local role authenticated;
select set_config('request.jwt.claims','{}',true);
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('auth_required',public.read_contact_secret('24000000-0000-4000-8000-000000000003','Synthetic unauthenticated reason'));
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002241","role":"authenticated","session_id":"24000000-0000-4000-8000-000000002241"}',true);
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('sales',public.read_contact_secret('24000000-0000-4000-8000-000000000003','Synthetic sales reason'));
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002242","role":"authenticated","session_id":"24000000-0000-4000-8000-000000002242"}',true);
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('manager',public.read_contact_secret('24000000-0000-4000-8000-000000000003','Synthetic manager reason'));
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002241","role":"authenticated","session_id":"24000000-0000-4000-8000-000000002241","user_metadata":{"role":"super_admin","primary_department_id":2242}}',true);
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('forged',public.read_contact_secret('24000000-0000-4000-8000-000000000003','Synthetic forged reason'));
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002243","role":"authenticated","session_id":"24000000-0000-4000-8000-000000002243"}',true);
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('reason_required',public.read_contact_secret('24000000-0000-4000-8000-000000000003',null));
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('reason_invalid',public.read_contact_secret('24000000-0000-4000-8000-000000000003',E'bad\nreason'));
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('allowed',public.read_contact_secret('24000000-0000-4000-8000-000000000003','Need synthetic customer verification','24000000-0000-4000-8000-000000009999'));
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('no_channels',public.read_contact_secret('24000000-0000-4000-8000-000000000004','Need synthetic empty-state verification'));
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('inactive_contact',public.read_contact_secret('24000000-0000-4000-8000-000000000005','Need synthetic inactive verification'));
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('unknown_contact',public.read_contact_secret('24000000-0000-4000-8000-000000000099','Need synthetic missing verification'));
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002244","role":"authenticated","session_id":"24000000-0000-4000-8000-000000002244"}',true);
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('disabled',public.read_contact_secret('24000000-0000-4000-8000-000000000003','Synthetic disabled reason'));
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002245","role":"authenticated","session_id":"24000000-0000-4000-8000-000000002245"}',true);
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('inactive_department',public.read_contact_secret('24000000-0000-4000-8000-000000000003','Synthetic inactive department reason'));
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000002246","role":"authenticated","session_id":"24000000-0000-4000-8000-000000009999"}',true);
select set_config('app.request_id','',true);
select set_config('app.correlation_id','',true);
insert into wbs_2_2_contact_rpc_results values('stale_session',public.read_contact_secret('24000000-0000-4000-8000-000000000003','Synthetic stale session reason'));
reset role;

select is((select result ->> 'ok' from wbs_2_2_contact_rpc_results where label='sales'),'true','ordinary sales receives a stable success envelope');
select is((select result #>> '{data,contact_access,allowed}' from wbs_2_2_contact_rpc_results where label='sales'),'false','ordinary sales is denied before WBS 4.2');
select is((select result #>> '{data,contact_access,reason_code}' from wbs_2_2_contact_rpc_results where label='sales'),'NOT_CLAIMED','ordinary sales receives the frozen default reason');
select is((select result #>> '{data,contact_access,reason_code}' from wbs_2_2_contact_rpc_results where label='auth_required'),'AUTH_REQUIRED','missing authenticated identity is denied safely');
select is((select count(*) from wbs_2_2_contact_rpc_results cross join lateral jsonb_object_keys(result #> '{data,contact_access}') where label='sales'),2::bigint,'denied sales response has only allowed and reason code');
select ok((select not (result #> '{data,contact_access}' ?| array['full_name','channels','mobile','phone','email','wechat','other']) from wbs_2_2_contact_rpc_results where label='sales'),'denied sales response omits every sensitive key');
select is((select result #>> '{data,contact_access,reason_code}' from wbs_2_2_contact_rpc_results where label='manager'),'NOT_CLAIMED','department manager is denied before WBS 4.2');
select is((select result #>> '{data,contact_access,reason_code}' from wbs_2_2_contact_rpc_results where label='forged'),'NOT_CLAIMED','forged user metadata cannot elevate sales');
select is((select result #>> '{data,contact_access,reason_code}' from wbs_2_2_contact_rpc_results where label='reason_required'),'REASON_REQUIRED','super admin must provide a reason');
select ok((select not (result #> '{data,contact_access}' ?| array['full_name','channels']) from wbs_2_2_contact_rpc_results where label='reason_required'),'missing reason response omits sensitive keys');
select is((select result #>> '{data,contact_access,reason_code}' from wbs_2_2_contact_rpc_results where label='reason_invalid'),'REASON_INVALID','unsafe reason is rejected without echoing it');
select is((select result ->> 'ok' from wbs_2_2_contact_rpc_results where label='allowed'),'true','authorized super admin receives a stable success envelope');
select is((select result #>> '{data,contact_access,allowed}' from wbs_2_2_contact_rpc_results where label='allowed'),'true','authorized super admin is allowed');
select is((select result #>> '{data,contact_access,full_name}' from wbs_2_2_contact_rpc_results where label='allowed'),'Synthetic RPC Person','authorized response returns the private name');
select is((select jsonb_array_length(result #> '{data,contact_access,channels}') from wbs_2_2_contact_rpc_results where label='allowed'),5,'authorized response returns five populated channels');
select is((select array_agg(channel ->> 'type' order by ordinality) from wbs_2_2_contact_rpc_results cross join lateral jsonb_array_elements(result #> '{data,contact_access,channels}') with ordinality as item(channel,ordinality) where label='allowed'),array['mobile','phone','email','wechat','other']::text[],'authorized channels use the frozen deterministic type order');
select is((select count(*) from wbs_2_2_contact_rpc_results cross join lateral jsonb_object_keys(result #> '{data,contact_access}') where label='allowed'),3::bigint,'authorized branch has exactly allowed name and channels');
select is((select result ->> 'correlation_id' from wbs_2_2_contact_rpc_results where label='allowed'),'24000000-0000-4000-8000-000000009999','authorized response preserves correlation id');
select is((select count(*) from public.audit_log where source='contacts' and action='secret.read' and outcome='success' and correlation_id='24000000-0000-4000-8000-000000009999'),1::bigint,'authorized read writes one correlated success audit');
select is((select safe_data ->> 'channel_count' from public.audit_log where source='contacts' and action='secret.read' and correlation_id='24000000-0000-4000-8000-000000009999'),'5','authorized audit stores only the safe channel count');
select is((select safe_data from public.audit_log where source='contacts' and action='secret.read' and correlation_id='24000000-0000-4000-8000-000000009999'),'{"channel_count":5}'::jsonb,'authorized audit contains no extra data');
select is((select result #>> '{data,contact_access,allowed}' from wbs_2_2_contact_rpc_results where label='no_channels'),'true','super admin may read an active contact with no secret row');
select is((select result #> '{data,contact_access,channels}' from wbs_2_2_contact_rpc_results where label='no_channels'),'[]'::jsonb,'authorized no-channel state returns an empty array');
select ok((select result #> '{data,contact_access}' ? 'full_name' from wbs_2_2_contact_rpc_results where label='no_channels'),'authorized no-channel state permits full name null');
select is((select result #>> '{data,contact_access,reason_code}' from wbs_2_2_contact_rpc_results where label='inactive_contact'),'CONTACT_UNAVAILABLE','inactive contact is unavailable');
select is((select result #>> '{data,contact_access,reason_code}' from wbs_2_2_contact_rpc_results where label='unknown_contact'),'CONTACT_UNAVAILABLE','unknown contact uses the same safe unavailable reason');
select is((select result #>> '{data,contact_access,reason_code}' from wbs_2_2_contact_rpc_results where label='disabled'),'MEMBERSHIP_INACTIVE','disabled member old JWT is denied');
select is((select result #>> '{data,contact_access,reason_code}' from wbs_2_2_contact_rpc_results where label='inactive_department'),'DEPARTMENT_INACTIVE','inactive department old JWT is denied distinctly');
select is((select result #>> '{data,contact_access,reason_code}' from wbs_2_2_contact_rpc_results where label='stale_session'),'SESSION_INVALID','stale session is denied');
select ok((select not (result #> '{data,contact_access}' ?| array['full_name','channels']) from wbs_2_2_contact_rpc_results where label='disabled'),'disabled-member response omits sensitive keys');
select is((select count(*) from wbs_2_2_contact_rpc_results where label not in('allowed','no_channels') and (select count(*) from jsonb_object_keys(result #> '{data,contact_access}'))=2),11::bigint,'every denied response has the exact two-key shape');
select is((select count(*) from public.audit_log where source='contacts' and action='secret.read' and outcome='denied'),11::bigint,'every denied RPC writes one audit');
select is((select count(*) from public.audit_log where source='contacts' and action='secret.read' and outcome='success'),2::bigint,'every allowed RPC writes one audit');
select is((select count(*) from public.audit_log where source='contacts' and action='secret.read' and target_id is not null),13::bigint,'all contact RPC audits identify a safe public target');
select is((select count(*) from public.audit_log where source='contacts' and action='secret.read' and outcome='denied' and safe_data='{}'::jsonb),11::bigint,'denied audits carry no caller reason or sensitive data');
select is((select count(*) from public.audit_log where source='contacts' and action='secret.read' and outcome='success' and safe_data - 'channel_count' <> '{}'::jsonb),0::bigint,'success audits contain only the safe channel count');
select is((select count(*) from public.audit_log where source='contacts' and action='secret.read' and safe_data::text like '%Need synthetic%'),0::bigint,'caller reasons are never copied into audit safe data');
select is((select count(*) from public.audit_log where source='contacts' and action='secret.read' and (safe_data::text like '%Synthetic RPC Person%' or safe_data::text like '%rpc-person@example.test%' or safe_data::text like '%00000000000%')),0::bigint,'contact values never enter audit safe data');
select is((select count(*) from public.audit_log where source='contacts' and action='secret.read' and request_id is not null and correlation_id is not null),13::bigint,'all contact access audits use 1.6 trace ids');
select is((select count(*) from wbs_2_2_contact_rpc_results where result::text ~* '(document|storage|mask|tail|hash)'),0::bigint,'contact RPC responses contain no document storage mask tail or hash data');
select ok((select not p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='read_contact_secret'),'public wrapper is security invoker');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname='read_contact_secret'),'private reader is security definer');
select ok((select p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and p.proname='contact_access_capability'),'private capability is security definer');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ((n.nspname='public' and p.proname='read_contact_secret') or (n.nspname='app_private' and p.proname in('read_contact_secret','contact_access_capability'))) and position('search_path=' in array_to_string(p.proconfig,','))>0),3::bigint,'all contact access functions fix an empty search path');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral unnest(coalesce(p.proargnames,array[]::text[])) arg_name where n.nspname='public' and p.proname='read_contact_secret' and arg_name ~* '(member|department|role|owner)'),0::bigint,'public wrapper accepts no caller-supplied authority');
select is((select count(*) from wbs_2_2_contact_rpc_results where label='forged' and result::text like '%Synthetic RPC Person%'),0::bigint,'forged metadata response contains no private canary');

select * from finish();
rollback;
