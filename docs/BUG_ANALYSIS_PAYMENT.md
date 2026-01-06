# CRITICAL BUG ANALYSIS: Wrong Contributor Payment

## Incident Summary
**Date:** 2026-01-06 02:19 AM
**Issue:** #2 ($9,708 ROXN bounty)
**Expected Recipient:** zainabfatima097 (PR #74 author)
**Actual Recipient:** dominitas (wrong person)
**Root Cause:** Timeline event parsing logic selecting wrong merged PR

---

## THE PRIMARY BUG (server/github.ts:1266-1315)

### Code Location
```typescript
// Lines 1266-1296 in handleIssueClosed()
for (let i = timelineEvents.length - 1; i >= 0; i--) {
  const event = timelineEvents[i];

  if (event.event === 'cross-referenced' && event.source?.type === 'issue') {
    const sourceIssue = event.source.issue; // This is actually a PR
    const mergedAt = sourceIssue?.pull_request?.merged_at;
    const isMerged = sourceIssue?.state === 'closed' && mergedAt != null;

    if (isMerged) {
      closingPRAuthor = sourceIssue?.user?.login;
      break; // ❌ STOPS AT FIRST MERGED PR FOUND
    }
  }
}
```

### What Went Wrong
**Timeline of Issue #2:**
```
[Newest]
  ↓
- cross-referenced: PR #78 by dominitas (merged, but NOT the closing PR)
- cross-referenced: PR #74 by zainabfatima097 (merged, ACTUAL closing PR)
- ... older events ...
  ↓
[Oldest]
```

**Algorithm Flow:**
1. Iterates backwards (newest → oldest)
2. Finds PR #78 cross-reference (merged ✓, references issue ✓)
3. **STOPS** and selects dominitas
4. Never checks PR #74 (the actual closing PR)

### Why This is Wrong
**The code assumes:** "First merged PR in reverse timeline = closing PR"
**Reality:** Multiple merged PRs can reference the same issue:
- Via "Fixes #X" in PR description
- Via comments mentioning "#X"
- Via commits mentioning "#X"
- Via manual cross-references

Only ONE of these PRs actually **closed** the issue, but the code can't distinguish which one.

---

## ALL EDGE CASES THAT CAUSE THIS BUG

### Case 1: Multiple PRs Reference Same Issue ✅ (Our case)
**Scenario:**
- PR #1 mentions "Related to #123" → cross-referenced event
- PR #2 mentions "Fixes #123" → cross-referenced event + closes issue
- Both PRs merge
- Issue #123 closes

**Bug:** Pays PR #1 author instead of PR #2

---

### Case 2: Partial Fixes Across Multiple PRs
**Scenario:**
- Issue #500: "Implement feature X with parts A, B, C"
- PR #501: Implements part A, merged
- PR #502: Implements part B, merged
- PR #503: Implements part C, merged, closes issue

**Bug:** Pays PR #501 or #502 author instead of PR #503

---

### Case 3: PR Mentioned in Comments
**Scenario:**
- Issue #200 has bounty
- Someone comments: "See PR #201 for related work"
- PR #201 merges (creates cross-reference)
- PR #250 actually fixes #200 and merges

**Bug:** Pays PR #201 author instead of PR #250

---

### Case 4: Reverted PR Creates Cross-Reference
**Scenario:**
- PR #100 fixes issue #50, merges
- PR #100 gets reverted (PR #101), both merged
- PR #102 fixes #50 properly, merges, closes issue

**Bug:** Pays PR #100 or #101 author instead of PR #102

---

### Case 5: Bot PRs Create Cross-References
**Scenario:**
- Dependabot PR #300 mentions issue #400 in description
- PR #300 merges (auto-merged by bot) ← **Currently filtered out by bot check**
- Developer PR #301 fixes #400, merges

**Bug:** Code has bot filter (`prAuthor.endsWith('[bot]')`), so this is handled ✅
**But:** What if bot account doesn't end with [bot]? Still vulnerable.

---

### Case 6: Timeline Pagination Issues
**Scenario:**
- Issue #1000 has 1500 timeline events
- Code fetches max 10 pages (1000 events, line 1259)
- Actual closing PR event is on page 11

**Bug:** Closing PR event never seen, payment fails entirely
**Severity:** HIGH - Complete payment failure

---

### Case 7: Race Condition - Issue Closed Before PR Merged
**Scenario:**
- Issue #600 manually closed by maintainer
- Later, PR #700 that mentions #600 gets merged
- Timeline shows:
  1. Issue closed
  2. PR merged

**Bug:** Code might find PR #700 as "merged PR referencing closed issue" and pay wrong person
**Current Code:** Should handle this because it checks `issue.state === 'closed'` in webhook trigger, not timeline

---

### Case 8: Multiple Issues Closed by Same PR
**Scenario:**
- PR #800 description: "Fixes #100, Fixes #200, Fixes #300"
- All 3 issues have bounties
- PR #800 merges

**Bug:** Code should work correctly (each issue webhook fires separately)
**But:** If issues #100, #200, #300 all have other cross-referenced PRs, wrong payment possible

---

### Case 9: Force Push Changes PR Author
**Scenario:**
- User A creates PR #900
- User B force-pushes to PR #900 (becomes co-author)
- PR #900 merges
- Timeline shows User B as recent actor

**Bug:** Depends on `sourceIssue.user.login` (PR creator), not event.actor
**Current Code:** Uses PR creator ✅, should be safe

---

### Case 10: Transferred Repository
**Scenario:**
- Repository transferred from org A to org B
- Old PRs have cross-references
- New PRs close issues

**Bug:** Timeline events might have mismatched repo IDs
**Severity:** UNKNOWN - needs testing

---

## FOLLOW-UP BUGS AND VULNERABILITIES

### Follow-up Bug 1: Idempotency Check Insufficient
**Location:** Lines 1345-1349
```typescript
const existingPayout = await storage.getPayoutByRepoAndIssue(String(repoId), issueNumber);
if (existingPayout) {
  log(`Payout already processed... Skipping duplicate payout.`);
  return;
}
```

**Problem:** Checks payout AFTER determining contributor
**Vulnerability:**
1. Issue #2 closed, webhook fires
2. Code finds wrong PR (dominitas), pays him
3. Records payout for issue #2
4. If webhook fires AGAIN (GitHub retry), idempotency check prevents duplicate
5. **But payment already went to wrong person!**

**Fix Needed:** Check payout status BEFORE timeline parsing

---

### Follow-up Bug 2: No Validation of "Closing" Relationship
**Problem:** Code checks if PR is merged, but not if it CLOSED the issue
**GitHub API provides:** `closed_by` field on issues
```json
{
  "closed_by": {
    "login": "zainabfatima097",
    "id": 123456
  }
}
```

**Current Code:** Ignores this field entirely
**Fix:** Use `payload.issue.closed_by` from webhook payload (if available)

---

### Follow-up Bug 3: Timeline API Unreliable
**GitHub Docs:** Timeline API is "best effort" and may not include all events
**Problem:** Relying on timeline for payment decisions = unreliable
**Example:** If GitHub's timeline API misses the closing PR event, payment fails

**Fix:** Use GitHub's dedicated `/repos/{owner}/{repo}/issues/{issue_number}/events` API
or check `issue.closed_by` field

---

### Follow-up Bug 4: No Manual Override Mechanism
**Scenario:** Bug causes wrong payment
**Current Fix:** Manual script intervention (like we just did)
**Problem:** No admin dashboard or function to:
- View pending payments
- Correct wrong payments
- Manually trigger payment to correct person
- Refund/reverse payments

**Fix Needed:** Admin payment management system

---

### Follow-up Bug 5: Insufficient Logging for Debugging
**Current Logs:** Show "Found contributor X via merged cross-referenced PR event"
**Missing Info:**
- Which PR number was selected
- How many candidate PRs were found
- Why this PR was chosen over others
- Full timeline event details

**Fix:** Enhanced logging with PR numbers and decision rationale

---

### Follow-up Bug 6: No User Notification
**Current:** Silent failure or success
**Problem:**
- Contributor doesn't know they'll be paid
- Wrong contributor doesn't know they received extra funds
- Pool manager doesn't know who was paid

**Fix:** Automated notifications via:
- GitHub comment on issue
- Email to contributor
- Dashboard notification

---

### Follow-up Bug 7: Security - Custodial Wallet Exposure
**Today's Discovery:** User worried that giving gas to custodial wallet = withdrawal risk
**Problem:** All user wallets are custodial (platform holds private keys)
**Attack Vector:**
1. Bug causes payment to user X
2. User X withdraws before we notice
3. Cannot recover funds

**Fix:** Consider non-custodial wallets or withdrawal delays/limits

---

### Follow-up Bug 8: No Dispute Resolution
**Scenario:** Wrong payment occurs
**Current:** No formal process to:
- Report wrong payment
- Investigate dispute
- Request refund from wrong recipient
- Redistribute to correct person

**Fix:** Dispute resolution system with:
- Dispute filing window (e.g., 7 days)
- Multi-sig approval for corrections
- Automatic notifications

---

### Follow-up Bug 9: Race Condition - Multiple Webhooks
**Scenario:**
- Issue #2 closes
- GitHub sends webhook #1
- Network delay
- GitHub retries, sends webhook #2
- Both arrive at server simultaneously

**Current Protection:** Idempotency check (lines 1345-1349)
**Problem:** Database race condition between:
1. Thread A: Check payout exists → NO
2. Thread B: Check payout exists → NO
3. Thread A: Distribute payment
4. Thread B: Distribute payment
5. **DOUBLE PAYMENT**

**Fix:** Database-level locking or distributed lock (Redis)

---

### Follow-up Bug 10: Blockchain Confirmation Timing
**Current Flow:**
1. Issue closes
2. Webhook fires immediately
3. Payment sent to blockchain
4. **What if blockchain TX fails?**

**Problem:** No retry mechanism for failed blockchain TXs
**Fix:** Queue-based payment system with retries

---

## SEVERITY CLASSIFICATION

### CRITICAL (Immediate Fix Required)
1. **Wrong contributor payment** (Primary bug)
2. Timeline API unreliability (Follow-up #3)
3. No idempotency before contributor detection (Follow-up #1)

### HIGH (Fix Soon)
4. No validation of closing relationship (Follow-up #2)
5. No manual override mechanism (Follow-up #4)
6. Race condition - multiple webhooks (Follow-up #9)

### MEDIUM (Address in Next Sprint)
7. Insufficient logging (Follow-up #5)
8. No user notifications (Follow-up #6)
9. Blockchain TX retry mechanism (Follow-up #10)

### LOW (Future Enhancement)
10. No dispute resolution (Follow-up #8)
11. Custodial wallet security (Follow-up #7)

---

## RECOMMENDED FIX STRATEGY

### Short-term Fix (Today/Tomorrow)
```typescript
// Option 1: Use issue.closed_by from webhook payload
if (payload.issue?.closed_by?.login) {
  closingPRAuthor = payload.issue.closed_by.login;
  log(`Using closed_by from issue: ${closingPRAuthor}`);
} else {
  // Fallback to timeline parsing (current logic)
}
```

### Medium-term Fix (This Week)
1. Use GitHub Events API instead of Timeline API
2. Add PR number validation
3. Implement payment queue with retries
4. Add comprehensive logging

### Long-term Fix (Next Sprint)
1. Admin dashboard for payment management
2. User notifications
3. Dispute resolution system
4. Move to non-custodial wallets

---

## TESTING REQUIREMENTS

### Test Cases to Add
1. ✅ Single PR closes issue
2. ✅ Multiple PRs reference same issue
3. ✅ PR mentioned in comments (not closing)
4. ✅ Reverted PR creates cross-reference
5. ✅ Bot PR cross-references issue
6. ✅ Issue with >1000 timeline events
7. ✅ Multiple issues closed by same PR
8. ✅ Webhook fires twice (idempotency)
9. ✅ Blockchain TX fails (retry logic)
10. ✅ Issue manually closed without PR

---

## AUDIT TRAIL

**Incident:** Issue #2 wrong payment
**Date:** 2026-01-06
**Resolution:**
- Sent 0.1 XDC gas to dominitas: TX `0x0761524f...`
- Transferred 9,659.46 ROXN to zainabfatima097: TX `0x42eca48c...`
- Reclaimed XDC from dominitas: TX `0x9425f621...`

**Lessons Learned:**
1. Timeline API is unreliable for payment decisions
2. Need `closed_by` validation from issue payload
3. Need comprehensive logging with PR numbers
4. Need manual override mechanism for corrections
5. Need notification system for transparency

---

**Analysis Complete:** 2026-01-06
**Severity:** CRITICAL
**Status:** AWAITING FIX
