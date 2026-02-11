const stats = require('./Frontend/data/stats.json');
console.log('Stats:', JSON.stringify(stats.stats, null, 2));

const votes = require('./Frontend/data/votes.json');
const total = votes.votes.length;
const passCount = votes.votes.filter(v => v.outcome === 'PASS').length;
const otherOutcomes = {};
votes.votes.forEach(v => {
    if (v.outcome !== 'PASS') {
        otherOutcomes[v.outcome] = (otherOutcomes[v.outcome] || 0) + 1;
    }
});
console.log('\nManual verification:');
console.log('Total votes:', total);
console.log('PASS:', passCount, '(' + (passCount/total*100).toFixed(1) + '%)');
console.log('Other outcomes:', otherOutcomes);
console.log('Unanimous (noes=0 & abstain=0):', votes.votes.filter(v => v.noes === 0 && v.abstain === 0).length);

// Check a few non-PASS votes
const nonPass = votes.votes.filter(v => v.outcome !== 'PASS');
console.log('\nSample non-PASS votes:');
nonPass.slice(0, 10).forEach(v => {
    console.log('  id=' + v.id, 'outcome=' + v.outcome, 'title=' + v.title.substring(0, 60));
});
