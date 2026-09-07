const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const data = html.match(/<script id="policy-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
const engine = html.match(/<script id="policy-engine">([\s\S]*?)<\/script>/)[1];
const context = {document:{getElementById:()=>({textContent:data})}};
vm.createContext(context);
vm.runInContext(engine,context);
const {compute,findSchool,fieldIsKey,worldDisciplineMatch,fieldOptions,majorCode,policy} = context.HukouPolicy;
const plain = value => JSON.parse(JSON.stringify(value));
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname,'policy-fixture.json'),'utf8'));
const pairs = table => table.flatMap(r=>[0,2].filter(i=>r[i].trim()).map(i=>({code:r[i].trim(),name:r[i+1].trim()})));
const base = {degree:'bachelor',schoolInput:'10280',majorInput:'080901',rankLevel:'8',languageLevel:'8',computerLevel:'0',schoolHonorCount:'0',manualSchoolCategory:'auto',studyLocation:'auto',isFresh:true,isNonShanghai:true,employerQualified:true,contractOneYear:true,notDispatch:true,noLaborDuringStudy:true,educationQualified:true,lawful:true,materialsTrue:true,employerIntegrity:true};
const run = overrides => compute({...base,...overrides});
const points = (r,label) => r.items.find(i=>i.label===label)?.points || 0;

test('all school appendices and all 435 discipline rows equal the supplied document',()=>{
  for(const [key,t] of [['worldClassUniversities',5],['category1Schools',7],['category2Schools',8]]) assert.deepEqual(plain(policy[key]),pairs(fixture.tables[t]));
  const expected=fixture.tables[6].slice(1).map(r=>({schoolCode:r[2].trim(),schoolName:r[1].trim(),fieldCode:r[4].trim(),fieldName:r[3].trim()}));
  assert.deepEqual(plain(policy.worldClassDisciplines),expected);
});
test('all four key-field tables are present, including the 110 formerly missing bachelor entries',()=>{
  const expected=[];
  for(const [t,source,level,scope] of [[9,'研究生一级学科','graduate','group'],[10,'研究生二级学科','graduate','individual'],[11,'本科专业类','bachelor','group'],[12,'本科专业','bachelor','individual']]) expected.push(...pairs(fixture.tables[t]).map(r=>({...r,source,level,scope})));
  assert.equal(expected.length,361);
  assert.deepEqual(plain(policy.keyFields),expected);
  for(const row of expected) assert.ok(fieldIsKey(row.code,row.level==='graduate'?'master':'bachelor'),JSON.stringify(row));
});
test('every school resolves by bare five-digit code, exact name, and selected label',()=>{
  for(const key of ['category1Schools','category2Schools','worldClassUniversities']) for(const school of policy[key]) {
    assert.equal(findSchool(school.code)?.code,school.code);
    assert.equal(findSchool(school.name)?.code,school.code);
    assert.equal(findSchool(`${school.code} | ${school.name}`)?.code,school.code);
  }
});
test('partial school names and mixed identities cannot unlock direct admission',()=>{
  for(const text of ['上海','大学','北京','复旦大学附属假学校','99999 | 北京大学','10001 | 上海大学','1000','100010']) assert.equal(findSchool(text),null,text);
  assert.equal(run({degree:'master',schoolInput:'北京'}).directReasons.length,0);
});
test('school punctuation and full-width code normalization',()=>{
  assert.equal(findSchool('１０２８０')?.name,'上海大学');
  assert.equal(findSchool('中国矿业大学（北京）')?.code,'11413');
});
test('degrees use separate directories and ignore stale level labels',()=>{
  assert.equal(fieldIsKey('0812','bachelor'),null);
  assert.ok(fieldIsKey('0812','master'));
  assert.equal(fieldIsKey('020401','master'),null);
  assert.ok(fieldIsKey('020401','bachelor'));
  assert.equal(fieldIsKey('0201 | 理论经济学（研究生一级学科）','bachelor'),null);
  assert.equal(fieldIsKey('0809 | 计算机类（本科专业类）','master'),null);
  assert.equal(fieldIsKey('080901',''),null);
});
test('matches run from listed group to child, never from partial input to a specific entry',()=>{
  assert.ok(fieldIsKey('080901','bachelor'));
  assert.ok(fieldIsKey('081201','master'));
  assert.equal(fieldIsKey('0401','bachelor'),null);
  assert.equal(fieldIsKey('0101','master'),null);
  for(const value of ['08','080','08090','0809012','编号080901','080901xyz']) assert.equal(fieldIsKey(value,'bachelor'),null,value);
});
test('special alphabetic codes are intact',()=>{
  for(const code of ['02SY','07SY02','10SY01']) { assert.equal(majorCode(code),code); assert.ok(fieldIsKey(code,'bachelor')); }
  assert.equal(fieldIsKey('10SY','bachelor'),null);
});
test('exact field names work and fuzzy names do not award points',()=>{
  assert.ok(fieldIsKey('国际经济与贸易','bachelor'));
  assert.ok(fieldIsKey('学前教育','bachelor'));
  assert.equal(fieldIsKey('经济与','bachelor'),null);
  assert.equal(fieldIsKey('计算机','master'),null);
});
test('every named first-class discipline matches its own institution and complete code',()=>{
  for(const row of policy.worldClassDisciplines.filter(r=>r.fieldCode)) {
    for(const code of row.schoolCode.split('/')) {
      const school=findSchool(code);
      assert.ok(worldDisciplineMatch(school,row.fieldCode),JSON.stringify(row));
      assert.ok(worldDisciplineMatch(school,row.fieldName),JSON.stringify(row));
      assert.equal(worldDisciplineMatch(school,row.fieldCode.slice(0,2)),null);
    }
  }
});
test('one-discipline masters require matching institution and discipline',()=>{
  const school=findSchool('10008'); // 北京科技大学
  assert.ok(worldDisciplineMatch(school,'0806')); // 冶金工程
  assert.ok(worldDisciplineMatch(school,'冶金工程'));
  assert.equal(worldDisciplineMatch(school,'0201'),null);
  assert.equal(worldDisciplineMatch(school,'08'),null);
  assert.equal(worldDisciplineMatch(school,'0806','bachelor'),null);
  assert.ok(fieldOptions('master',school).some(x=>x.code==='0806'));
});
test('bachelor sample has correct 2026 total and automatic computer exemption',()=>{
  const result=run({honorLevel:'5',contestLevel:'5'});
  assert.equal(result.total,84);
  assert.equal(points(result,'计算机水平'),7);
  assert.equal(points(result,'引进重点领域人才'),6);
  assert.equal(result.directReasons.length,0);
});
test('non-direct masters receive computer points without selecting a certificate',()=>{
  const result=run({degree:'master',schoolInput:'普通高校',majorInput:'0812'});
  assert.equal(result.total,68);
  assert.equal(points(result,'计算机水平'),7);
  assert.equal(result.directReasons.length,0);
});
test('all six undergraduate exemption groups automatically get 7 computer points',()=>{
  for(const code of ['070101','080601','080701','080801','080901','120101']) assert.equal(points(run({majorInput:code}),'计算机水平'),7);
  assert.equal(points(run({majorInput:'020401'}),'计算机水平'),0);
});
test('honors are highest in category, capped at 2 school points and 15 combined',()=>{
  assert.equal(points(run({schoolHonorCount:'5'}),'荣誉称号与竞赛获奖'),2);
  assert.equal(points(run({honorLevel:'5',schoolHonorCount:'2'}),'荣誉称号与竞赛获奖'),5);
  assert.equal(points(run({honorLevel:'10',contestLevel:'10'}),'荣誉称号与竞赛获奖'),15);
  for(const count of ['-1','1.5','Infinity','x']) {const r=run({schoolHonorCount:count});assert.equal(r.basicPass,false);assert.equal(points(r,'荣誉称号与竞赛获奖'),0);assert.ok(Number.isFinite(r.total));}
});
test('unsupported degrees, blank schools, and each missing basic condition prevent success',()=>{
  for(const degree of ['', 'other']) assert.equal(run({degree}).basicPass,false);
  assert.equal(run({schoolInput:''}).basicPass,false);
  for(const key of ['isFresh','isNonShanghai','employerQualified','contractOneYear','notDispatch','noLaborDuringStudy','educationQualified','lawful','materialsTrue','employerIntegrity']) assert.equal(run({[key]:false}).basicPass,false,key);
});
test('startup score and startup social-insurance exemption are independent',()=>{
  const scoreOnly=run({noLaborDuringStudy:false,startup:true});
  assert.equal(scoreOnly.basicPass,false); assert.equal(points(scoreOnly,'自主创业'),5);
  const exceptionOnly=run({noLaborDuringStudy:false,startupSocialException:true});
  assert.equal(exceptionOnly.basicPass,true); assert.equal(points(exceptionOnly,'自主创业'),0);
});
test('master, doctorate, and bachelor direct pathways',()=>{
  assert.ok(run({degree:'doctor'}).directReasons.length);
  assert.ok(run({degree:'master',schoolInput:'10270'}).directReasons.length);
  assert.ok(run({degree:'master',schoolInput:'10002'}).directReasons.length);
  assert.equal(run({degree:'bachelor',schoolInput:'10001'}).directReasons.length,0);
  assert.ok(run({degree:'bachelor',schoolInput:'10001',bachelorFullTime:true}).directReasons.length);
  assert.equal(run({degree:'bachelor',schoolInput:'10280',bachelorFullTime:true}).directReasons.length,0);
});
test('region-only claims cannot award points or direct admission without official confirmation',()=>{
  const pending=run({keyRegionEmployer:true,keyRegionPublic:true,majorProject:true});
  assert.equal(pending.directReasons.length,0);
  assert.ok(pending.directPending.length);
  assert.equal(points(pending,'重点区域公益单位'),0);
  assert.equal(points(pending,'承担重大项目'),0);
  const confirmed=run({keyRegionEmployer:true,officialRecognition:true});
  assert.ok(confirmed.directReasons.length);
});
test('Naval Medical University is in-Shanghai and double-first-class',()=>{
  assert.ok(run({degree:'master',schoolInput:'91020'}).directReasons.length);
  assert.equal(points(run({schoolInput:'91020'}),'在沪学习分'),2);
  assert.ok(run({schoolInput:'91020',keyRegionEmployer:true,officialRecognition:true}).directReasons.length);
});
test('Shanghai research institutes do not receive university study bonus',()=>{
  const result=run({degree:'master',schoolInput:'80014'});
  assert.ok(result.directReasons.length); assert.equal(points(result,'在沪学习分'),0);
  assert.equal(points(run({studyLocation:'shanghaiInstitute'}),'在沪学习分'),0);
  assert.equal(points(run({studyLocation:'outside'}),'在沪学习分'),0);
});
test('verified manual location supports institutions outside appendix lists',()=>{
  assert.ok(run({degree:'master',schoolInput:'其他在沪研究所',studyLocation:'shanghaiInstitute'}).directReasons.length);
  assert.equal(points(run({schoolInput:'其他在沪高校',studyLocation:'shanghaiUniversity'}),'在沪学习分'),2);
});
test('public-employer bonuses are deduplicated; teacher point requires matching unit',()=>{
  const result=run({remotePublic:true,schoolKindergarten:true,teacherRole:true,officialRecognition:true});
  assert.equal(points(result,'公益事业单位'),3);assert.equal(points(result,'专任教师'),1);
  assert.equal(points(run({teacherRole:true,officialRecognition:true}),'专任教师'),0);
});
test('West Plan uses graduation-year policy and does not return an unverified eligibility conclusion',()=>{
  for(const year of ['', '2024']) {const r=run({westPlan:true,serviceGraduationYear:year});assert.equal(r.reviewRequired,true);assert.equal(points(r,'国家就业项目服务期满'),0);}
  assert.equal(points(run({westPlan:true,serviceGraduationYear:'2026'}),'国家就业项目服务期满'),5);
  assert.equal(run({westPlan:true,serviceGraduationYear:'2026',studyLocation:'outside'}).reviewRequired,true);
  assert.equal(run({specialPolicyProject:true}).reviewRequired,true);
});
test('72-point boundary and score arithmetic stay exact',()=>{
  const r=run({schoolInput:'普通高校',manualSchoolCategory:'other',majorInput:'020401',computerLevel:'7',honorLevel:'5',schoolHonorCount:'1',contestLevel:'1'});
  assert.equal(r.total,71); assert.equal(r.basicPass,true);
  assert.equal(run({schoolInput:'普通高校',manualSchoolCategory:'other',majorInput:'020401',computerLevel:'7',honorLevel:'0',schoolHonorCount:'2',contestLevel:'5'}).total,72);
  assert.equal(run({schoolInput:'普通高校',manualSchoolCategory:'other',majorInput:'020401',computerLevel:'7',honorLevel:'0',schoolHonorCount:'2',contestLevel:'6'}).total,73);
  for(let honor=0;honor<=3;honor++) {const result=run({schoolHonorCount:String(honor)});assert.equal(result.total,result.items.reduce((n,i)=>n+i.points,0));assert.ok(result.items.every(i=>Number.isInteger(i.points)));}
});
