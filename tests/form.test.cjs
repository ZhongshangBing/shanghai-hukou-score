const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=id=>html.match(new RegExp('<script id="'+id+'"[^>]*>([\\s\\S]*?)<\\/script>'))[1];
const context={document:{getElementById:()=>({textContent:script('policy-data')})}};
vm.createContext(context);vm.runInContext(script('policy-engine'),context);vm.runInContext(script('form-adapter'),context);
const {formState,directRoutes}=context.HukouForm;
const {compute}=context.HukouPolicy;
const points=(result,label)=>result.items.find(x=>x.label===label)?.points||0;
const calc=input=>compute(formState(input));
const base={degree:'bachelor',schoolInput:'10280',majorInput:'080901',employerReady:true,graduateReady:true,studySocial:'clean'};

test('bachelor route is discovered without any route checkbox while eligibility remains pending',()=>{
  const result=calc({degree:'bachelor',schoolInput:'10001'});
  assert.ok(directRoutes(result).length);
  assert.equal(result.basicPass,false);
  assert.equal(result.directReasons.length,0);
  assert.equal(formState({degree:'bachelor'}).bachelorFullTime,false);
});
test('master and doctorate routes are automatic with no graduate declaration',()=>{
  for(const input of [{degree:'master',schoolInput:'10270'},{degree:'doctor',schoolInput:'10280'},{degree:'master',schoolInput:'10008',majorInput:'冶金工程'}]) {
    const result=calc(input);assert.ok(directRoutes(result).length);assert.equal(result.basicPass,false);
  }
});
test('automatic computer points do not require a certificate field',()=>{
  assert.equal(points(calc({degree:'master',schoolInput:'普通高校'}),'计算机水平'),7);
  assert.equal(points(calc(base),'计算机水平'),7);
  assert.equal(points(calc({...base,majorInput:'020401'}),'计算机水平'),0);
});
test('compact declarations preserve the separate qualification requirements',()=>{
  assert.equal(calc(base).basicPass,true);
  for(const change of [{employerReady:false},{graduateReady:false},{studySocial:''},{studySocial:'other'}]) assert.equal(calc({...base,...change}).basicPass,false);
  assert.equal(points(calc({...base,employerReady:false}),'用人单位基本要素'),0);
  assert.equal(points(calc(base),'用人单位基本要素'),7);
});
test('one honor selection preserves maximum and school-count rules',()=>{
  for(const [choice,expected] of [['0',0],['1',1],['2',2],['5',5],['10',10]]) assert.equal(points(calc({...base,honor:choice}),'荣誉称号与竞赛获奖'),expected);
  assert.equal(points(calc({...base,honor:'10',contestLevel:'10'}),'荣誉称号与竞赛获奖'),15);
});
test('recognized employer selections retain unit deduplication and implied teacher unit',()=>{
  const result=calc({...base,publicEmployer:'remote',teacherRole:true});
  assert.equal(points(result,'公益事业单位'),3);assert.equal(points(result,'专任教师'),1);
  assert.equal(points(calc({...base,teacherRole:true}),'公益事业单位'),2);
  assert.equal(points(calc({...base,regionType:'public'}),'重点区域公益单位'),3);
  assert.ok(directRoutes(calc({...base,regionType:'employer'})).length);
});
test('startup score still cannot imply the insurance exception',()=>{
  assert.equal(calc({...base,studySocial:'other',startup:true}).basicPass,false);
  const result=calc({...base,studySocial:'startup'});assert.equal(result.basicPass,true);assert.equal(points(result,'自主创业'),0);
});
test('historical service projects remain pending after form simplification',()=>{
  const result=calc({...base,westPlan:true,serviceGraduationYear:'2024'});
  assert.equal(result.reviewRequired,true);assert.equal(points(result,'国家就业项目服务期满'),0);
});
