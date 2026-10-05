"use client";

import { SearchIcon } from "lucide-react";
import { useId, useOptimistic, useRef, useState, type ReactNode, type Ref } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { preventTypeahead } from "@/components/combobox-typeahead";
import { buttonVariants } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { retryHandlerOf, useAction } from "@/hooks/use-action";
import { cn } from "@/lib/utils";
import { profileMessages, type ProfileActions } from "@/modules/profile/schema";
import type { ProfileView } from "@/modules/profile/service";

import { failureTitles, profileLabels, themeNames, timeFormatNames } from "./labels";
import { matchingTimeZones } from "./timezone-search";

type Options = ProfileView["options"];
type TimeZoneChoice = Options["timezones"][number];

type PreferenceFieldProps = {
  readonly updatePreference: ProfileActions["updatePreference"];
  /** Sin permiso los valores se ven y no se cambian (PF-46). */
  readonly canEdit: boolean;
} & (
  | {
      readonly preference: "timezone";
      /** `view.timezoneOption`: el texto guardado puede no ser el de ninguna opción. */
      readonly value: string;
      readonly options: Options["timezones"];
    }
  | {
      readonly preference: "timeFormat";
      readonly value: string;
      readonly options: Options["timeFormats"];
    }
  | {
      readonly preference: "dateFormat";
      readonly value: string;
      readonly options: Options["dateFormats"];
    }
  | {
      readonly preference: "theme";
      readonly value: string;
      readonly options: Options["themes"];
    }
);

const triggerWidth = "w-full sm:w-80";

/**
 * Un control de las preferencias que guarda al cambiar (PF-32), con el valor
 * nuevo como vista optimista. Si falla, la transición descarta esa vista y el
 * control vuelve solo al anterior; el aviso queda debajo, y sobrevive a la
 * revalidación porque el campo sigue montado aunque `canEdit` cambie.
 *
 * Nunca usa `disabled`: un control con foco que pasa a `disabled` lo pierde a
 * `body`, y una membresía desactivada que intenta un cambio vuelve con
 * `canEdit` en falso y el foco todavía en el control. La zona sin permiso
 * es un `FixedSetting`: sin disparador, no hay control que rotular.
 */
export function PreferenceField(props: PreferenceFieldProps) {
  const controlId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [shown, show] = useOptimistic<string, string>(props.value, (_, next) => next);
  const save = useAction(props.updatePreference, {
    unreachableMessage: profileMessages.unexpected,
    optimistic: (input) => show(input.value),
  });

  function control() {
    switch (props.preference) {
      case "timezone":
        return (
          <TimeZonePicker
            id={controlId}
            triggerRef={triggerRef}
            value={shown}
            options={props.options}
            onChange={(value) => save.run({ key: "timezone", value })}
          />
        );
      case "timeFormat":
        return (
          <ChoiceSelect
            id={controlId}
            triggerRef={triggerRef}
            value={shown}
            options={props.options}
            nameOf={(value) => timeFormatNames[value]}
            canEdit={props.canEdit}
            onChange={(value) => save.run({ key: "timeFormat", value })}
          />
        );
      case "dateFormat":
        return (
          <ChoiceSelect
            id={controlId}
            triggerRef={triggerRef}
            value={shown}
            options={props.options}
            nameOf={(value) => value}
            canEdit={props.canEdit}
            onChange={(value) => save.run({ key: "dateFormat", value })}
          />
        );
      case "theme":
        // Los colores cambian con la respuesta, cuando la revalidación trae
        // la clase nueva de `<html>` (ADR 0015).
        return (
          <ChoiceSelect
            id={controlId}
            triggerRef={triggerRef}
            value={shown}
            options={props.options.map((value) => ({ value }))}
            nameOf={(value) => themeNames[value]}
            canEdit={props.canEdit}
            onChange={(value) => save.run({ key: "theme", value })}
          />
        );
    }
  }

  const retry = retryHandlerOf(save);
  const onRetry =
    retry === undefined
      ? undefined
      : () => {
          // «Reintentar» se va con su aviso: el foco pasa antes al control,
          // que sigue en la pantalla.
          triggerRef.current?.focus();
          retry();
        };

  return (
    <div className="grid gap-2">
      {props.preference === "timezone" && !props.canEdit ? (
        <FixedSetting
          label={profileLabels.timezone}
          value={
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{shown}</span>
              <ZoneOffset value={shown} options={props.options} />
            </span>
          }
        />
      ) : (
        <>
          <Label htmlFor={controlId}>{profileLabels[props.preference]}</Label>
          {control()}
        </>
      )}
      {save.failure !== null && (
        <ActionFeedback
          title={failureTitles[props.preference]}
          message={save.failure.message}
          onRetry={onRetry}
        />
      )}
    </div>
  );
}

type FixedSettingProps = {
  readonly label: string;
  readonly value: ReactNode;
  /** Quién lo decide, ya que acá no se cambia (PF-01, PF-02). */
  readonly note?: string;
};

/** Un ajuste que se muestra y no se edita en esta pantalla. */
export function FixedSetting({ label, value, note }: FixedSettingProps) {
  return (
    <dl className="grid gap-1 text-sm">
      <dt className="font-medium">{label}</dt>
      <dd>{value}</dd>
      {note !== undefined && <dd className="text-muted-foreground">{note}</dd>}
    </dl>
  );
}

/** El valor con su ejemplo, si tiene, como lo nombran el disparador y la opción. */
function choiceText(name: string, example: string | undefined): string {
  return example === undefined ? name : `${name} (${example})`;
}

type ChoiceSelectProps<Value extends string> = {
  readonly id: string;
  readonly triggerRef: Ref<HTMLButtonElement>;
  readonly value: string;
  /** Sin `example`, ni el disparador ni la opción llevan paréntesis (el tema). */
  readonly options: readonly { readonly value: Value; readonly example?: string }[];
  readonly nameOf: (value: Value) => string;
  readonly canEdit: boolean;
  readonly onChange: (value: Value) => void;
};

/**
 * Una opción de una lista cerrada: un formato con su ejemplo, o el tema sin
 * él. Sin permiso queda montado con `aria-disabled` y no abre: `readOnly`
 * fija el valor y la apertura la corta `changeOpen`, porque la primitiva deja
 * abrir un `Select` de solo lectura.
 */
function ChoiceSelect<Value extends string>({
  id,
  triggerRef,
  value,
  options,
  nameOf,
  canEdit,
  onChange,
}: ChoiceSelectProps<Value>) {
  const [open, setOpen] = useState(false);
  const items = options.map((option) => ({
    value: option.value,
    label: choiceText(nameOf(option.value), option.example),
  }));

  function changeOpen(next: boolean): void {
    if (next && !canEdit) {
      return;
    }
    setOpen(next);
  }

  function choose(next: string | null): void {
    const option = options.find((candidate) => candidate.value === next);
    if (option === undefined || option.value === value || !canEdit) {
      return;
    }
    onChange(option.value);
  }

  return (
    <Select
      items={items}
      value={value}
      onValueChange={choose}
      readOnly={!canEdit}
      open={open}
      onOpenChange={changeOpen}
    >
      <SelectTrigger
        ref={triggerRef}
        id={id}
        aria-disabled={!canEdit || undefined}
        className={cn(
          triggerWidth,
          "aria-disabled:cursor-default aria-disabled:opacity-60",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {nameOf(option.value)}
            {option.example !== undefined && (
              <>
                {" "}
                <span className="text-muted-foreground">({option.example})</span>
              </>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** El desplazamiento de la zona elegida, o nada si no es ninguna opción. */
function ZoneOffset({
  value,
  options,
}: {
  readonly value: string;
  readonly options: Options["timezones"];
}) {
  const selected = options.find((option) => option.value === value);
  return selected === undefined ? null : (
    <span className="text-muted-foreground shrink-0">{selected.example}</span>
  );
}

type TimeZonePickerProps = {
  readonly id: string;
  readonly triggerRef: Ref<HTMLButtonElement>;
  readonly value: string;
  readonly options: Options["timezones"];
  readonly onChange: (value: string) => void;
};

/**
 * La zona horaria: un disparador con rol `combobox` que abre el buscador y la
 * lista, cada zona con su desplazamiento. Filtra solo `matchingTimeZones`.
 * Solo con permiso: sin él, `PreferenceField` la muestra fija (TT-92).
 */
function TimeZonePicker({
  id,
  triggerRef,
  value,
  options,
  onChange,
}: TimeZonePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value) ?? null;

  function changeOpen(next: boolean): void {
    if (!next) {
      setSearch("");
    }
    setOpen(next);
  }

  function choose(option: TimeZoneChoice | null): void {
    if (option === null || option.value === value) {
      return;
    }
    onChange(option.value);
  }

  return (
    <Combobox<TimeZoneChoice>
      items={matchingTimeZones(options, search)}
      filter={null}
      value={selected}
      onValueChange={choose}
      isItemEqualToValue={(item, chosen) => item.value === chosen.value}
      itemToStringLabel={(option) => option.value}
      inputValue={search}
      onInputValueChange={setSearch}
      open={open}
      onOpenChange={changeOpen}
    >
      <ComboboxTrigger
        ref={triggerRef}
        id={id}
        onKeyDown={preventTypeahead}
        className={cn(
          buttonVariants({ variant: "outline" }),
          triggerWidth,
          "justify-start font-normal",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{value}</span>
        <ZoneOffset value={value} options={options} />
      </ComboboxTrigger>
      <ComboboxContent className="w-80">
        <ComboboxInput
          showTrigger={false}
          aria-label={profileLabels.timezoneSearch}
          placeholder={profileLabels.timezoneSearch}
        >
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
        </ComboboxInput>
        {/* Siempre a la vista, para que la región `status` anuncie el vacío. */}
        <ComboboxEmpty className="flex empty:py-0">
          {profileLabels.timezoneEmpty}
        </ComboboxEmpty>
        <ComboboxList>
          {(option: TimeZoneChoice) => (
            <ComboboxItem key={option.value} value={option}>
              <span className="min-w-0 flex-1 truncate">{option.value}</span>
              <span className="text-muted-foreground shrink-0">{option.example}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
