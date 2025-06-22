import { type FieldApi } from '@tanstack/react-form'
import { Caption } from '@telegram-apps/telegram-ui'

interface FieldInfoProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    field: FieldApi<any, any, any, any>
}

const FieldInfo = ({ field }: FieldInfoProps) => {
    return (
        <div>
            {field.state.meta.isTouched && field.state.meta.errors.length ? (
                <Caption className="text-red-500 text-sm">
                    {field.state.meta.errors.join(',')}
                </Caption>
            ) : null}
        </div>
    )
}

export default FieldInfo
