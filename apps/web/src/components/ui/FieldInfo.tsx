import { useFieldContext } from "@/hooks";
import { useStore } from "@tanstack/react-form";
import { Caption } from "@telegram-apps/telegram-ui";

const FieldInfo = () => {
  const field = useFieldContext();
  const [errors, isTouched] = useStore(field.store, (state) => [
    state.meta.errors,
    field.state.meta.isTouched,
  ]);
  return (
    <div>
      {isTouched && errors.length ? (
        <Caption className="text-red-500 text-sm">{errors.join(",")}</Caption>
      ) : null}
    </div>
  );
};

export default FieldInfo;
