# Financial Calculation Test Scenarios

This document outlines comprehensive test scenarios for validating the financial calculation robustness.

## Test Cases for getNetShare Function

### Basic Calculation Tests

**Test 1: Simple Debt Calculation**

```typescript
// User A paid $10, User B owes $5
// Expected: 5.00 (User B owes User A $5)
const expenses = [
  { payerId: userA, amount: 10.0, shares: [{ userId: userB, amount: 5.0 }] },
];
```

**Test 2: Mutual Expenses**

```typescript
// User A paid $10, User B owes $5
// User B paid $8, User A owes $3
// Expected: 2.00 (User B owes User A $2)
const expenses = [
  { payerId: userA, amount: 10.0, shares: [{ userId: userB, amount: 5.0 }] },
  { payerId: userB, amount: 8.0, shares: [{ userId: userA, amount: 3.0 }] },
];
```

### Settlement Tests

**Test 3: Settlement Reduces Debt**

```typescript
// User A paid $10, User B owes $5
// User B settled $2 to User A
// Expected: 3.00 (User B still owes User A $3)
const settlements = [{ senderId: userB, receiverId: userA, amount: 2.0 }];
```

**Test 4: Bidirectional Settlements**

```typescript
// User A paid $10, User B owes $5
// User A settled $3 to User B (overpayment scenario)
// Expected: -8.00 (User A owes User B $8)
const settlements = [{ senderId: userA, receiverId: userB, amount: 3.0 }];
```

### Floating Point Precision Tests

**Test 5: Micro Amount Handling**

```typescript
// Amounts that cause floating point precision issues
const expenses = [
  { amount: 10.01, share: 3.337 }, // 10.01 / 3 = 3.336666...
  { amount: 0.1 + 0.2, share: 0.3 }, // Classic JS precision issue
];
// Should handle without creating false debtors/creditors
```

**Test 6: Threshold Boundary Testing**

```typescript
// Test amounts right at the threshold boundaries
const balances = [
  0.009, // Below DISPLAY threshold (0.01) - should not appear as debtor
  0.01, // At DISPLAY threshold - should appear as debtor
  0.011, // Above DISPLAY threshold - should appear as debtor
  0.99, // Below SETTLEMENT threshold (1.00) - debtor but not settlement eligible
  1.0, // At SETTLEMENT threshold - settlement eligible
  1.01, // Above SETTLEMENT threshold - settlement eligible
];
```

## Test Cases for isDebtor/isCreditor Functions

**Test 7: Threshold Filtering**

```typescript
const testCases = [
  { balance: 0.009, expectedDebtor: false, expectedCreditor: false },
  { balance: 0.01, expectedDebtor: true, expectedCreditor: false },
  { balance: -0.009, expectedDebtor: false, expectedCreditor: false },
  { balance: -0.01, expectedDebtor: false, expectedCreditor: true },
  { balance: 0, expectedDebtor: false, expectedCreditor: false },
];
```

## Edge Cases

**Test 8: Large Number Precision**

```typescript
// Test with large amounts that might lose precision
const largeAmounts = [
  999999.99,
  1000000.01,
  9007199254740991, // Max safe integer
];
```

**Test 9: Decimal Edge Cases**

```typescript
// Test edge cases in decimal conversion
const edgeCases = [null, undefined, "10.50", 10.5, new Decimal("10.50")];
```

**Test 10: Multiple Currency Support (Future)**

```typescript
// When multiple currencies are supported
const mixedCurrencyTest = [
  { amount: 10.0, currency: "USD" },
  { amount: 8.5, currency: "EUR" },
]; // Should handle appropriately or throw error
```

## Performance Tests

**Test 11: Large Dataset Performance**

```typescript
// Test with many expenses and settlements
const largeDataset = {
  expenses: generateExpenses(1000),
  settlements: generateSettlements(500),
  users: 100,
};
// Should complete within reasonable time bounds
```

## Integration Tests

**Test 12: End-to-End Workflow**

```typescript
// Complete workflow from expense creation to settlement
1. Create expense: User A pays $30 for 3 people ($10 each)
2. Check balances: Users B and C each owe $10 to User A
3. User B settles $5
4. Check balances: User B owes $5, User C owes $10
5. User C settles $15 (overpayment)
6. Check balances: User A owes $5 to User C, User B owes $5 to User A
```

## Expected Behavior

### Threshold Compliance

- Amounts below `FINANCIAL_THRESHOLDS.DISPLAY` (0.01) should not create debtor/creditor relationships
- Amounts below `FINANCIAL_THRESHOLDS.SETTLEMENT` (1.00) should not be eligible for settlement
- All calculations should maintain precision to avoid floating point errors

### Data Integrity

- Sum of all debts should equal sum of all credits in a closed system
- Settlement amounts should properly adjust balances
- No user should appear as both debtor and creditor to the same person

### Error Handling

- Invalid amounts (negative, NaN, infinite) should be handled gracefully
- Null/undefined values should default to 0
- Type validation should prevent incorrect usage

## Manual Testing Checklist

- [ ] Create expenses with exact threshold amounts
- [ ] Test settlement creation and balance updates
- [ ] Verify no false positives for micro amounts
- [ ] Check UI displays formatted amounts correctly
- [ ] Test rapid succession of operations
- [ ] Verify database consistency after operations
- [ ] Test with different decimal precision scenarios
- [ ] Validate error messages for invalid inputs
