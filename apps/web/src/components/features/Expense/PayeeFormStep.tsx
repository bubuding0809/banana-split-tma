import { type ReactFormExtendedApi } from '@tanstack/react-form'
import { type z } from 'zod'

import { type expenseFormSchema } from './AddExpenseForm.type'

interface PayeeformStepProps {
   form: ReactFormExtendedApi<z.infer<typeof expenseFormSchema>>
}

const PayeeformStep = ({ form }: PayeeformStepProps) => {
   return <div>Paid By</div>
}

export default PayeeformStep
