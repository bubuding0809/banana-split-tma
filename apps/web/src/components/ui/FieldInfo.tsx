import { useFieldContext } from "@/hooks";
import { useStore } from "@tanstack/react-form";
import { Caption } from "@telegram-apps/telegram-ui";

const FieldInfo = () => {
  const field = useFieldContext();
  const [errors, isTouched] = useStore(field.store, (state) => [
    state.meta.errors,
    field.state.meta.isTouched,
  ]);

  if (isTouched && !errors.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      {errors.map((error, index) =>
        error.message && typeof error.message === "string" ? (
          <Caption key={index} className="text-red-500 text-sm">
            {error.message}
          </Caption>
        ) : null
      )}
    </div>
  );
};

export default FieldInfo;
