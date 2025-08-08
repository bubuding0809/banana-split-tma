# Feature Specification: Edit Existing Expenses

> **Note**: This specification has been updated based on existing codebase analysis. Key infrastructure already exists including `getExpenseDetails` tRPC procedure and edit button placeholder in the expense modal. Authorization complexity has been removed for simplicity.

## User Story

**As a** user managing expenses in a group chat  
**I want to** edit existing expenses that I've created  
**So that** I can correct mistakes, update details, or modify expense information without having to delete and recreate the expense  

## Background & Context

Based on analysis of the current addExpense implementation, users go through a 3-step wizard:
1. **Amount Step**: Currency, amount, description, and payee selection
2. **Payee Step**: Who paid for the expense  
3. **Split Mode Step**: How the expense is split (Equal/Shares/Exact)

Users frequently need to modify expense details after creation due to:
- Incorrect amounts or currency selection
- Wrong payee or participant selections  
- Description updates or corrections
- Split configuration changes
- Missing participants in the split

Currently, users must delete and recreate expenses, losing historical context and requiring re-entry of all data.

## Technical Analysis Summary

### Current Implementation Architecture
- **Route Structure**: `/_tma/chat/$chatId_/add-expense` with URL-based step management
- **Form Technology**: TanStack React Form with Zod validation
- **State Management**: `useAddExpenseFormStore` Zustand store for cross-step state
- **Validation**: Real-time validation with `FieldInfo` error display
- **API Integration**: tRPC procedures (`createExpense`, `getChatWithMembers`, `getCurrencies`)
- **UI Framework**: Telegram UI components with custom form components
- **Navigation**: TanStack Router with Telegram SDK buttons (back/main/secondary)

### Key Components Identified
- `AddExpensePage` - Main route component with step orchestration
- `AddExpenseAmountStep` - Amount, currency, description, payee form
- `AddExpensePayeeStep` - Payee selection interface  
- `SplitModeFormStep` - Split configuration (Equal/Shares/Exact)
- Form stores: `useAddExpenseFormStore`, `useSplitFormStore`
- API: `expense.create` tRPC procedure

## Acceptance Criteria

### Core Edit Functionality
- [ ] **AC-1**: Users can access edit option for expenses (edit button already exists in expense modal)
- [ ] **AC-2**: Replace placeholder alert with actual navigation to edit form
- [ ] **AC-3**: Edit flow follows the same 3-step wizard pattern as creation
- [ ] **AC-4**: All form fields are pre-populated with existing expense data:
  - Amount, currency, and description
  - Selected payee
  - All participants and their split configuration
  - Split mode (Equal/Shares/Exact) and associated data
- [ ] **AC-5**: Form validation works identically to creation flow
- [ ] **AC-6**: Users can modify any aspect of the expense across all steps
- [ ] **AC-7**: Updated expense reflects immediately in chat after save

### Navigation & UX
- [ ] **AC-8**: Edit route follows pattern: `/chat/$chatId_/edit-expense/$expenseId`
- [ ] **AC-9**: Step navigation works with URL state management (step query param)
- [ ] **AC-10**: Telegram back button navigates between steps and back to chat
- [ ] **AC-11**: Main button shows "Update Expense" instead of "Create Expense"
- [ ] **AC-12**: Cancel operation returns to chat without saving changes
- [ ] **AC-13**: Loading states during expense fetch and update operations

### Simplified Implementation
- [ ] **AC-14**: Any user can edit any expense (no authorization complexity)
- [ ] **AC-15**: Edit functionality works for all expenses in the chat

### Data Integrity
- [ ] **AC-18**: Balance calculations update after expense modifications
- [ ] **AC-19**: Split amounts recalculate correctly based on changes
- [ ] **AC-20**: Chat member balances reflect updated expense data
- [ ] **AC-21**: Expense timestamps show last modified date
- [ ] **AC-22**: All participants see updated expense information

## Technical Requirements

### Frontend Extensions Required
- **Route Addition**: New edit expense route with expense ID parameter
- **Form Store Extension**: Support for pre-populating form state from existing data
- **Component Reuse**: Leverage existing step components with edit mode flag
- **Edit Button Integration**: Replace placeholder alert with real navigation
- **State Management**: Handle edit vs create modes in existing form stores

### Backend Extensions Required
- **API Endpoints**: 
  - ✅ `getExpenseDetails` query already exists (fetches expense with all relations)
  - ❌ `updateExpense` mutation for saving changes (main missing piece)
- **Data Validation**: Ensure update payloads match creation validation
- **Business Logic**: Balance recalculation after expense updates

### Database Considerations
- **Audit Trail**: Track `updatedAt` timestamps for expense modifications
- **Referential Integrity**: Maintain consistency during expense updates

## Tasks Breakdown

### Frontend Engineering Tasks

#### Route & Navigation Implementation
- [ ] **FE-1**: Create edit expense route `/chat/$chatId_/edit-expense/$expenseId`
- [ ] **FE-2**: Add route API configuration for expense ID parameter
- [ ] **FE-3**: Replace placeholder alert in `ChatExpenseCell.onEditExpense` with navigation to edit form
- [ ] **FE-4**: Update Telegram button handling for edit vs create modes

#### Form State Management
- [ ] **FE-5**: Extend `useAddExpenseFormStore` to support edit mode initialization
- [ ] **FE-6**: Add expense data pre-population logic to form stores
- [ ] **FE-7**: Update `useSplitFormStore` for existing split configuration loading
- [ ] **FE-8**: Handle form reset and cleanup for edit operations

#### Component Integration
- [ ] **FE-9**: Update `AddExpensePage` to support edit mode with expense fetching
- [ ] **FE-10**: Modify step components to handle pre-populated data
- [ ] **FE-11**: Update form submission logic for expense updates vs creation
- [ ] **FE-12**: Add edit mode indicators in UI (breadcrumbs, titles)

#### UI/UX Enhancements
- [ ] **FE-13**: ~~Add edit button to expense items~~ (✅ already exists in expense modal)
- [ ] **FE-14**: Update main button text and behavior for edit operations
- [ ] **FE-15**: Add loading states for expense fetching and updating
- [ ] **FE-16**: Implement success/error feedback for expense updates

#### API Integration
- [ ] **FE-17**: ~~Integrate `getExpenseById`~~ (✅ `getExpenseDetails` already used)
- [ ] **FE-18**: Implement `updateExpense` tRPC mutation integration
- [ ] **FE-19**: Add error handling for expense update failures
- [ ] **FE-20**: Handle optimistic updates for better UX

### Backend Engineering Tasks

#### API Development  
- [ ] **BE-1**: ~~Create `getExpenseById` tRPC query procedure~~ (✅ `getExpenseDetails` already exists)
- [ ] **BE-2**: Create `updateExpense` tRPC mutation procedure
- [ ] **BE-3**: Design update input validation schemas (reuse creation schemas)
- [ ] **BE-4**: Add proper error handling and response formatting

#### Data Layer Implementation
- [ ] **BE-5**: ~~Create Prisma query for expense retrieval~~ (✅ already exists in `getExpenseDetails`)
- [ ] **BE-6**: Implement expense update transaction with proper validations
- [ ] **BE-7**: Add `updatedAt` timestamp handling for expense modifications
- [ ] **BE-8**: Ensure split participant updates maintain data consistency
- [ ] **BE-9**: Handle expense member additions/removals during updates

#### Business Logic
- [ ] **BE-10**: Implement balance recalculation triggers after expense updates
- [ ] **BE-11**: Update split amount calculations for modified expenses
- [ ] **BE-12**: Maintain chat member balance consistency


### Quality Assurance Tasks

#### Unit Testing
- [ ] **QA-1**: Test edit route component with expense data loading
- [ ] **QA-2**: Test form store pre-population with existing expense data
- [ ] **QA-3**: Test step navigation and state management in edit mode
- [ ] **QA-4**: Test form validation with modified expense data
- [ ] **QA-5**: Test API integration for both fetch and update operations

#### Integration Testing  
- [ ] **QA-6**: Test complete edit flow from chat to successful update
- [ ] **QA-7**: Test permission validation and unauthorized access scenarios
- [ ] **QA-8**: Test balance recalculation accuracy after expense updates
- [ ] **QA-9**: Test concurrent edit scenarios and data consistency
- [ ] **QA-10**: Test error handling and user feedback flows

#### User Acceptance Testing
- [ ] **QA-11**: Validate edit button accessibility and placement in chat
- [ ] **QA-12**: Test form pre-population accuracy across all steps  
- [ ] **QA-13**: Verify successful expense updates appear correctly in chat
- [ ] **QA-14**: Test Telegram integration (buttons, haptics, theme)
- [ ] **QA-15**: Cross-platform testing (iOS/Android/Web Telegram clients)

## Implementation Strategy

### Phase 1: Core Backend Infrastructure
1. Implement `updateExpense` tRPC procedure (main missing piece)
2. Add input validation and error handling
3. Create unit tests for update endpoint

### Phase 2: Frontend Route and Navigation
1. Create edit expense route leveraging existing `getExpenseDetails`
2. Replace placeholder alert with real navigation to edit form
3. Update Telegram button integration

### Phase 3: Form Integration  
1. Extend form stores for edit mode support
2. Implement data pre-population across all form steps
3. Update form submission for expense updates

### Phase 4: UI Polish and Testing
1. ~~Add edit buttons~~ (already exist in expense modal)
2. Implement loading states and error handling
3. Comprehensive testing and bug fixes

## Risk Assessment

**Low Risk:**
- Form component reuse (existing patterns well established)
- Route structure (follows existing conventions)
- Telegram SDK integration (established patterns)

**Medium Risk:**
- Form state management complexity with pre-population
- Balance recalculation edge cases
- Complex split mode modifications

**High Risk:**
- Data consistency during complex split mode updates
- Concurrent edit scenarios in group chats
- Performance impact with large expense histories

## Success Metrics

- Edit completion rate (started vs finished) > 85%
- Expense update accuracy (no data loss) = 100%
- User satisfaction with edit experience > 4.0/5
- Reduced support requests for expense corrections by > 50%
- No performance regression in chat loading times

## Dependencies

### Existing Architecture
- TanStack React Form and Router infrastructure
- Telegram UI component library and SDK integration
- tRPC API layer with Prisma database models
- Zustand form state management stores
- Current expense creation form components and validation schemas

### External Dependencies
- Telegram Web App platform capabilities
- Database schema modifications (minimal - mainly timestamps)
- No new third-party libraries required

## Definition of Done

- [ ] All acceptance criteria validated and approved
- [ ] Frontend and backend implementation complete
- [ ] Unit and integration tests passing > 95%
- [ ] Code review completed and approved by team leads
- [ ] Feature tested in staging environment
- [ ] Performance testing shows no significant regression
- [ ] Accessibility compliance verified
- [ ] Documentation updated where applicable
- [ ] Feature ready for production deployment

---

*This specification leverages the existing robust architecture of the addExpense form while extending it to support expense editing. The implementation should maintain consistency with current patterns and user experience expectations.*