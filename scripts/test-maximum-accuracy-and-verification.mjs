import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {
  crossVerifyProjectSources,
  verifyAnswerAccuracy,
  computeDataVersionHash,
  canonicalizeQueryForConsistency,
  lookupConsistentAnswer,
  storeConsistentAnswer,
  clearConsistencyLedger,
  recordAccuracyAuditEvent,
  getAccuracyAuditSummary,
  clearAccuracyAuditLog
} from '../src/utils/accuracyVerificationEngine.js';
import { verifyAndPolishAnswer } from '../src/utils/projectArchitectureAnalyzer.js';
import { executeCentralAIResponse } from '../src/services/centralAiEngine.js';

const widgetPath = path.resolve(process.cwd(), 'public/widget.js');
const widgetSrc = fs.readFileSync(widgetPath, 'utf8');

async function queryCentral(question, databaseRecords, sessionId) {
  const result = await executeCentralAIResponse({
    userMessage: question, databaseRecords, knowledgeBase: staleConflictKb,
    agentConfig: { name: 'Sunrise College Assistant', companyName: 'Sunrise College' },
    tenantId: 'test-tenant', agentId: 'sunrise-agent', sessionId
  });
  return result.reply;
}

const sampleCourses = [
  {
    name: 'Class 11 Science',
    price: '₹28,000/yr',
    stock: 42,
    unit: 'seats',
    description: 'Physics, Chemistry, Mathematics, and Biology with modern labs.'
  },
  {
    name: 'Class 11 Commerce',
    price: '₹19,500/yr',
    stock: 35,
    unit: 'seats',
    description: 'Accountancy, Economics, and Business Studies.'
  }
];

const staleConflictKb = [
  {
    q: 'What is the fee for Class 11 Science?',
    a: 'The annual fee for Class 11 Science is ₹20,000 per year.'
  },
  {
    q: 'How can I contact admissions?',
    a: 'Call us at +91 98220 11223 or email admissions@sunrise.edu.'
  }
];

const sampleDeepIndex = {
  indexedAt: '2026-11-18T11:00:00Z',
  totalFiles: 5,
  files: [
    { path: 'src/middleware/auth.js' },
    { path: 'src/routes/orders.js' },
    { path: 'src/routes/users.js' },
    { path: 'src/db/schema.sql' },
    { path: 'src/App.jsx' }
  ],
  backendRoutes: [
    { method: 'GET', path: '/api/orders', file: 'src/routes/orders.js', tables: ['orders'] },
    { method: 'POST', path: '/api/orders/:id/confirm', file: 'src/routes/orders.js', tables: ['orders'] },
    { method: 'GET', path: '/api/users', file: 'src/routes/users.js', tables: ['users'] }
  ],
  databaseTables: [
    { name: 'users' },
    { name: 'orders' },
    { name: 'products' }
  ]
};

async function runTests() {
  let passed = 0;

  // TEST 1: Cross-Source Conflict Resolution (Live DB Supersedes Outdated KB FAQ!)
  {
    const gt = crossVerifyProjectSources({
      catalogItems: sampleCourses,
      knowledgeBase: staleConflictKb,
      hostKnowledge: { phone: '+91 98220 11223', email: 'admissions@sunrise.edu' },
      deepProjectIndex: sampleDeepIndex
    });

    assert.equal(gt.conflicts.length, 1, `Expected 1 price conflict, got ${gt.conflicts.length}`);
    assert.equal(gt.conflicts[0].entity, 'Class 11 Science');
    assert.equal(gt.conflicts[0].staleValue, '₹20,000');
    assert.equal(gt.conflicts[0].authoritativeValue, '₹28,000/yr');
    assert.ok(gt.groundTruthBlock.includes('[CROSS_VERIFIED_GROUND_TRUTH]'));
    assert.ok(gt.groundTruthBlock.includes('₹28,000/yr'));

    console.log('✅ Test 1 passed: Cross-source conflict detection resolves live DB over stale KB FAQ');
    passed++;
  }

  // TEST 2: Price & Stock Hallucination Audit Gate (Auto-Repairs Wrong Numbers!)
  {
    const gt = crossVerifyProjectSources({
      catalogItems: sampleCourses,
      knowledgeBase: staleConflictKb
    });

    const hallucinatedReply = 'Class 11 Science costs ₹35,000 and currently has 99 seats available.';
    const audit = verifyAnswerAccuracy(hallucinatedReply, {
      query: 'What is the fee and availability for Class 11 Science?',
      groundTruth: gt,
      catalogItems: sampleCourses,
      matchedItem: sampleCourses[0]
    });

    assert.equal(audit.passed, false, 'Hallucinated price/stock must fail clean audit');
    assert.equal(audit.repaired, true, 'Hallucinated price/stock must be auto-repaired');
    assert.ok(audit.issues.some(i => i.type === 'price_mismatch'), 'Must flag price_mismatch');
    assert.ok(audit.issues.some(i => i.type === 'stock_mismatch'), 'Must flag stock_mismatch');
    assert.ok(audit.text.includes('₹28,000/yr') && !audit.text.includes('₹35,000'), `Repaired text must contain verified price: ${audit.text}`);
    assert.ok(audit.text.includes('42 seats') && !audit.text.includes('99 seats'), `Repaired text must contain verified stock: ${audit.text}`);

    // Clean accurate reply passes without repair
    const accurateReply = 'Class 11 Science is ₹28,000/yr and currently has 42 seats available.';
    const cleanAudit = verifyAnswerAccuracy(accurateReply, {
      query: 'What is the fee for Class 11 Science?',
      groundTruth: gt,
      catalogItems: sampleCourses,
      matchedItem: sampleCourses[0]
    });
    assert.equal(cleanAudit.passed, true);
    assert.equal(cleanAudit.repaired, false);

    console.log('✅ Test 2 passed: Price & stock hallucination audit catches and auto-repairs mismatches');
    passed++;
  }

  // TEST 3: Fabricated Contact Details Guard (Strips Invented Phones & Emails, Preserves Verified Ones!)
  {
    const gt = crossVerifyProjectSources({
      catalogItems: sampleCourses,
      knowledgeBase: staleConflictKb,
      hostKnowledge: { phone: '+91 98220 11223', email: 'admissions@sunrise.edu' }
    });

    const fakeContactReply = 'Please call +91 99999 88888 or email fake@college.test for help.';
    const auditFake = verifyAnswerAccuracy(fakeContactReply, {
      query: 'How do I contact you?',
      groundTruth: gt
    });
    assert.equal(auditFake.passed, false);
    assert.ok(auditFake.issues.some(i => i.type === 'fabricated_contact'));
    assert.ok(!auditFake.text.includes('99999') && !auditFake.text.includes('fake@college.test'), `Fabricated contacts must be removed: ${auditFake.text}`);

    const realContactReply = 'You can call +91 98220 11223 or email admissions@sunrise.edu anytime!';
    const auditReal = verifyAnswerAccuracy(realContactReply, {
      query: 'How do I contact you?',
      groundTruth: gt
    });
    assert.equal(auditReal.passed, true, `Verified contacts should pass cleanly: ${JSON.stringify(auditReal.issues)}`);
    assert.ok(auditReal.text.includes('+91 98220 11223') && auditReal.text.includes('admissions@sunrise.edu'));

    console.log('✅ Test 3 passed: Fabricated contact guard blocks invented phones/emails while preserving real ones');
    passed++;
  }

  // TEST 4: Technical Implementation Validator (Studio Mode Catches Fake Routes, Files & DB Tables!)
  {
    const gt = crossVerifyProjectSources({
      deepProjectIndex: sampleDeepIndex
    });

    const hallucinatedTech = 'Authentication runs in src/services/phantomAuth.js via POST /api/stripe/charge and writes to database table `billing_invoices`.';
    const verifiedTechFallback = 'Authentication middleware is located in src/middleware/auth.js, and verified routes are GET /api/orders, POST /api/orders/:id/confirm, and GET /api/users using tables users, orders, and products.';

    const techAudit = verifyAnswerAccuracy(hallucinatedTech, {
      query: 'How does authentication and billing work?',
      groundTruth: gt,
      verifiedFallback: verifiedTechFallback,
      isCustomerMode: false
    });
    assert.equal(techAudit.passed, false);
    assert.equal(techAudit.repaired, true);
    assert.ok(techAudit.issues.some(i => i.type === 'invalid_route'), 'Must catch fake route /api/stripe/charge');
    assert.ok(techAudit.issues.some(i => i.type === 'invalid_file'), 'Must catch fake file src/services/phantomAuth.js');
    assert.ok(techAudit.issues.some(i => i.type === 'invalid_table'), 'Must catch fake table billing_invoices');
    assert.equal(techAudit.text, verifiedTechFallback);

    // Real implementation citations pass cleanly (including parameterized routes!)
    const validTech = 'Order confirmation is handled in src/routes/orders.js via POST /api/orders/123/confirm and updates database table `orders`.';
    const validTechAudit = verifyAnswerAccuracy(validTech, {
      query: 'How are orders confirmed?',
      groundTruth: gt,
      isCustomerMode: false
    });
    assert.equal(validTechAudit.passed, true, `Valid technical citations should pass: ${JSON.stringify(validTechAudit.issues)}`);

    // Also test via verifyAndPolishAnswer integration
    const polished = verifyAndPolishAnswer(hallucinatedTech, {
      groundTruth: gt,
      verifiedFallback: verifiedTechFallback,
      isCustomerMode: false
    });
    assert.ok(polished.includes('src/middleware/auth.js') && !polished.includes('phantomAuth.js'));

    console.log('✅ Test 4 passed: Technical implementation validator catches fake routes/files/tables and validates real code');
    passed++;
  }

  // TEST 5: Rephrased Question Consistency Ledger & Automatic Data-Update Invalidation
  {
    clearConsistencyLedger();
    clearAccuracyAuditLog();

    const k1 = canonicalizeQueryForConsistency('What is the fee for Class 11 Science?', { catalogItems: sampleCourses });
    const k2 = canonicalizeQueryForConsistency('How much does Class 11 Science cost?', { catalogItems: sampleCourses });
    const k3 = canonicalizeQueryForConsistency('Class 11 Science fees?', { catalogItems: sampleCourses });
    assert.ok(k1 && k1 === k2 && k2 === k3, `Rephrasings must share canonical key: ${k1} | ${k2} | ${k3}`);

    const v1 = computeDataVersionHash({ catalogItems: sampleCourses, knowledgeBase: staleConflictKb });
    storeConsistentAnswer(k1, v1, 'Class 11 Science fee is ₹28,000/yr.');
    assert.equal(lookupConsistentAnswer(k2, v1), 'Class 11 Science fee is ₹28,000/yr.');

    // Update live price ₹28,000/yr -> ₹30,000/yr: cache MUST auto-invalidate!
    const updatedCourses = [{ ...sampleCourses[0], price: '₹30,000/yr' }, sampleCourses[1]];
    const v2 = computeDataVersionHash({ catalogItems: updatedCourses, knowledgeBase: staleConflictKb });
    assert.notEqual(v1, v2, 'Version hash must change when live data updates');
    assert.equal(lookupConsistentAnswer(k2, v2), null, 'Consistency ledger must invalidate immediately on data change');

    // End-to-end Studio consistency test across rephrasings
    const studioA1 = await queryCentral('What is the fee for Class 11 Science?', sampleCourses, 'accuracy-a1');
    const studioA2 = await queryCentral('How much does Class 11 Science cost?', sampleCourses, 'accuracy-a2');
    assert.equal(studioA1, studioA2, 'Rephrased factual questions in Studio must return consistent verified answers');
    assert.ok(studioA1.includes('₹28,000/yr'), `Must use authoritative ₹28,000/yr, not stale ₹20,000: ${studioA1}`);

    // Now update catalog price to ₹30,000/yr -> Studio MUST immediately return ₹30,000/yr (no stale cache!)
    const studioA3 = await queryCentral('How much does Class 11 Science cost?', updatedCourses, 'accuracy-a3');
    assert.ok(studioA3.includes('₹30,000/yr'), `Updated live DB price must immediately invalidate cache: ${studioA3}`);

    console.log('✅ Test 5 passed: Rephrased queries stay 100% consistent and auto-invalidate on live data changes');
    passed++;
  }

  // TEST 6: Strict Uncertainty Enforcement When Ungrounded (General Knowledge Passes Untouched!)
  {
    const gt = crossVerifyProjectSources({ catalogItems: sampleCourses });

    const ungroundedGuess = 'The hostel fee is ₹45,000 per year including meals.';
    const ungroundedAudit = verifyAnswerAccuracy(ungroundedGuess, {
      query: 'What is the hostel fee?',
      groundTruth: gt,
      catalogItems: sampleCourses,
      hasVerifiedContext: false,
      isGeneralOffTopic: false
    });
    assert.equal(ungroundedAudit.passed, false);
    assert.equal(ungroundedAudit.repaired, true);
    assert.ok(ungroundedAudit.issues.some(i => i.type === 'ungrounded_claim'));
    assert.ok(!ungroundedAudit.text.includes('₹45,000'), `Ungrounded price must be blocked: ${ungroundedAudit.text}`);
    assert.ok(/apologize|don't have exact information/i.test(ungroundedAudit.text));

    // General knowledge / math passes untouched
    const generalReply = 'Certainly! 25% of 400 is 100.';
    const generalAudit = verifyAnswerAccuracy(generalReply, {
      query: 'What is 25% of 400?',
      groundTruth: gt,
      hasVerifiedContext: false,
      isGeneralOffTopic: true
    });
    assert.equal(generalAudit.passed, true);
    assert.equal(generalAudit.text, generalReply);

    console.log('✅ Test 6 passed: Strict uncertainty gate blocks ungrounded guesses while preserving general knowledge');
    passed++;
  }

  // TEST 7: Published widget delegates secure execution to the backend.
  {
    assert.ok(widgetSrc.includes("/api/agent/query"));
    assert.ok(!widgetSrc.includes("databaseRecords"));
    assert.ok(!widgetSrc.includes("supabaseKey") && !widgetSrc.includes("firestore.googleapis.com"));
    assert.ok(!widgetSrc.includes("api.groq.com") && !widgetSrc.includes("api.openai.com"));
    assert.ok(widgetSrc.includes("The assistant is temporarily unavailable"));
    console.log("✅ Test 7 passed: Public widget is a thin client for the secure API");
    passed++;
  }

  // TEST 8: Continuous Improvement Telemetry (Accuracy Audit Summary & Recurring Gaps)
  {
    clearAccuracyAuditLog();
    recordAccuracyAuditEvent({ agentName: 'DemoBot', query: 'What is Science fee?', passed: true, repaired: false, conflictCount: 1, issues: [] });
    recordAccuracyAuditEvent({ agentName: 'DemoBot', query: 'What is hostel fee?', passed: false, repaired: true, conflictCount: 0, issues: [{ type: 'ungrounded_claim', detail: 'Blocked ungrounded price' }] });
    recordAccuracyAuditEvent({ agentName: 'DemoBot', query: 'What is hostel fee?', passed: false, repaired: true, conflictCount: 0, issues: [{ type: 'ungrounded_claim', detail: 'Blocked ungrounded price' }] });
    recordAccuracyAuditEvent({ agentName: 'DemoBot', query: 'How does billing route work?', passed: false, repaired: true, conflictCount: 0, issues: [{ type: 'invalid_route', detail: 'Blocked /api/stripe' }] });

    const summary = getAccuracyAuditSummary('DemoBot');
    assert.equal(summary.totalChecked, 4);
    assert.equal(summary.verifiedCleanCount, 1);
    assert.equal(summary.repairedCount, 3);
    assert.equal(summary.totalConflictsResolved, 1);
    assert.equal(summary.passRate, 25);
    assert.equal(summary.issuesByCategory.ungrounded_claim, 2);
    assert.equal(summary.issuesByCategory.invalid_route, 1);
    assert.equal(summary.topRecurringGaps[0].query, 'what is hostel fee?');
    assert.equal(summary.topRecurringGaps[0].count, 2);

    clearAccuracyAuditLog();
    assert.equal(getAccuracyAuditSummary('DemoBot').totalChecked, 0);

    console.log('✅ Test 8 passed: Continuous improvement accuracy telemetry tracks pass rate, error categories & recurring gaps');
    passed++;
  }

  console.log(`\n🎉 ALL ${passed}/8 PILLAR 7 MAXIMUM ACCURACY & VERIFICATION TESTS PASSED!`);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
