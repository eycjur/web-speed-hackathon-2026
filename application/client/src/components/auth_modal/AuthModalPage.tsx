import { FormEvent, useEffect, useId, useMemo, useState } from "react";

import { AuthFormData } from "@web-speed-hackathon-2026/client/src/auth/types";
import { validate } from "@web-speed-hackathon-2026/client/src/auth/validation";
import { Input } from "@web-speed-hackathon-2026/client/src/components/foundation/Input";
import { Link } from "@web-speed-hackathon-2026/client/src/components/foundation/Link";
import { ModalErrorMessage } from "@web-speed-hackathon-2026/client/src/components/modal/ModalErrorMessage";
import { ModalSubmitButton } from "@web-speed-hackathon-2026/client/src/components/modal/ModalSubmitButton";

interface Props {
  onRequestCloseModal: () => void;
  onSubmit: (values: AuthFormData) => Promise<string | null>;
  resetKey: number;
}

const initialValues: AuthFormData = {
  type: "signin",
  username: "",
  name: "",
  password: "",
};

export const AuthModalPage = ({ onRequestCloseModal, onSubmit, resetKey }: Props) => {
  const usernameId = useId();
  const nameId = useId();
  const passwordId = useId();
  const [values, setValues] = useState<AuthFormData>(initialValues);
  const [fieldErrors, setFieldErrors] = useState(validate(initialValues));
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setValues(initialValues);
    setFieldErrors(validate(initialValues));
    setSubmitError(null);
    setIsSubmitting(false);
  }, [resetKey]);

  const isInvalid = useMemo(() => {
    const errors = validate(values);
    return Object.keys(errors).length > 0;
  }, [values]);

  const updateValues = (patch: Partial<AuthFormData>) => {
    setValues((current) => {
      const nextValues = { ...current, ...patch };
      setFieldErrors(validate(nextValues));
      return nextValues;
    });
    setSubmitError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validate(values);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    const error = await onSubmit(values);
    setIsSubmitting(false);

    if (error == null) {
      onRequestCloseModal();
      return;
    }

    setSubmitError(error);
  };

  return (
    <form className="grid gap-y-6" onSubmit={handleSubmit}>
      <h2 className="text-center text-2xl font-bold">
        {values.type === "signin" ? "サインイン" : "新規登録"}
      </h2>

      <div className="flex justify-center">
        <button
          className="text-cax-brand underline"
          onClick={() =>
            updateValues({
              type: values.type === "signin" ? "signup" : "signin",
              name: values.type === "signin" ? values.name : "",
            })
          }
          type="button"
        >
          {values.type === "signin" ? "初めての方はこちら" : "サインインはこちら"}
        </button>
      </div>

      <div className="grid gap-y-2">
        <label className="grid gap-y-1 text-sm" htmlFor={usernameId}>
          <span>ユーザー名</span>
          <Input
            id={usernameId}
            autoComplete="username"
            data-auth-input="username"
            leftItem={<span className="text-cax-text-subtle leading-none">@</span>}
            value={values.username}
            onChange={(event) => updateValues({ username: event.currentTarget.value })}
          />
          {fieldErrors.username ? (
            <span className="text-cax-danger text-xs">{fieldErrors.username}</span>
          ) : null}
        </label>

        {values.type === "signup" ? (
          <label className="grid gap-y-1 text-sm" htmlFor={nameId}>
            <span>名前</span>
            <Input
              id={nameId}
              autoComplete="nickname"
              value={values.name}
              onChange={(event) => updateValues({ name: event.currentTarget.value })}
            />
            {fieldErrors.name ? (
              <span className="text-cax-danger text-xs">{fieldErrors.name}</span>
            ) : null}
          </label>
        ) : null}

        <label className="grid gap-y-1 text-sm" htmlFor={passwordId}>
          <span>パスワード</span>
          <Input
            id={passwordId}
            autoComplete={values.type === "signup" ? "new-password" : "current-password"}
            type="password"
            value={values.password}
            onChange={(event) => updateValues({ password: event.currentTarget.value })}
          />
          {fieldErrors.password ? (
            <span className="text-cax-danger text-xs">{fieldErrors.password}</span>
          ) : null}
        </label>
      </div>

      {values.type === "signup" ? (
        <p>
          <Link className="text-cax-brand underline" onClick={onRequestCloseModal} to="/terms">
            利用規約
          </Link>
          に同意して
        </p>
      ) : null}

      <ModalSubmitButton disabled={isSubmitting || isInvalid} loading={isSubmitting}>
        {values.type === "signin" ? "サインイン" : "登録する"}
      </ModalSubmitButton>

      <ModalErrorMessage>{submitError}</ModalErrorMessage>
    </form>
  );
};
