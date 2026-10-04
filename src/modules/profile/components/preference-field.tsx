"use client";

import { CircleAlertIcon, SearchIcon } from "lucide-react";
import { useId, useOptimistic, useState, type KeyboardEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
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

import { failureTitles, profileLabels, timeFormatNames } from "./labels";
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
);

const triggerWidth = "w-full sm:w-80";

/**
 * Un control de «Hora y fecha» que guarda al cambiar (PF-32), con el valor
 * nuevo como vista optimista. Si falla, la transición descarta esa vista y el
 * control vuelve solo al anterior; el aviso queda debajo, y sobrevive a la
 * revalidación porque el campo sigue montado aunque `canEdit` cambie.
 *
 * Nunca usa `disabled`: un control con foco que pasa a `disabled` lo pierde a
 * `body`, y una membresía desactivada que intenta un cambio vuelve con
 * `canEdit` en falso y el foco todavía en el control.
 */
export function PreferenceField(props: PreferenceFieldProps) {
  const controlId = useId();
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
            value={shown}
            options={props.options}
            canEdit={props.canEdit}
            onChange={(value) => save.run({ key: "timezone", value })}
          />
        );
      case "timeFormat":
        return (
          <FormatSelect
            id={controlId}
            value={shown}
            options={props.options}
            nameOf={(value) => timeFormatNames[value]}
            canEdit={props.canEdit}
            onChange={(value) => save.run({ key: "timeFormat", value })}
          />
        );
      case "dateFormat":
        return (
          <FormatSelect
            id={controlId}
            value={shown}
            options={props.options}
            nameOf={(value) => value}
            canEdit={props.canEdit}
            onChange={(value) => save.run({ key: "dateFormat", value })}
          />
        );
    }
  }

  const onRetry = retryHandlerOf(save);

  return (
    <div className="grid gap-2">
      <Label htmlFor={controlId}>{profileLabels[props.preference]}</Label>
      {control()}
      {save.failure !== null && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{failureTitles[props.preference]}</AlertTitle>
          <AlertDescription>{save.failure.message}</AlertDescription>
          {onRetry !== undefined && (
            <div className="col-start-2 mt-2">
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                {profileLabels.retry}
              </Button>
            </div>
          )}
        </Alert>
      )}
    </div>
  );
}

/** El valor con su ejemplo, como lo nombran el disparador y la opción. */
function choiceText(name: string, example: string): string {
  return `${name} (${example})`;
}

type FormatSelectProps<Value extends string> = {
  readonly id: string;
  readonly value: string;
  readonly options: readonly { readonly value: Value; readonly example: string }[];
  readonly nameOf: (value: Value) => string;
  readonly canEdit: boolean;
  readonly onChange: (value: Value) => void;
};

/**
 * Un formato con su ejemplo. Sin permiso queda montado con `aria-disabled`
 * y no abre: `readOnly` fija el valor y la apertura la corta `changeOpen`,
 * porque la primitiva deja abrir un `Select` de solo lectura.
 */
function FormatSelect<Value extends string>({
  id,
  value,
  options,
  nameOf,
  canEdit,
  onChange,
}: FormatSelectProps<Value>) {
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
            {nameOf(option.value)}{" "}
            <span className="text-muted-foreground">({option.example})</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Una tecla imprimible sobre el disparador cerrado elegiría la zona que
 * empieza con esa letra (typeahead de la primitiva): la zona cambiaría sin
 * abrir el selector.
 */
function preventTypeahead(
  event: KeyboardEvent<HTMLButtonElement> & { preventBaseUIHandler: () => void },
): void {
  if (event.key.length === 1 && event.key !== " ") {
    event.preventBaseUIHandler();
  }
}

type TimeZonePickerProps = {
  readonly id: string;
  readonly value: string;
  readonly options: Options["timezones"];
  readonly canEdit: boolean;
  readonly onChange: (value: string) => void;
};

/**
 * La zona horaria: un disparador con rol `combobox` que abre el buscador y la
 * lista, cada zona con su desplazamiento. Filtra solo `matchingTimeZones`.
 * Sin permiso es texto, sin disparador (TT-92).
 */
function TimeZonePicker({ id, value, options, canEdit, onChange }: TimeZonePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value) ?? null;
  const offset =
    selected === null ? null : (
      <span className="text-muted-foreground shrink-0">{selected.example}</span>
    );

  if (!canEdit) {
    return (
      <span id={id} className="flex min-w-0 items-center gap-2 text-sm">
        <span className="truncate">{value}</span>
        {offset}
      </span>
    );
  }

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
        id={id}
        onKeyDown={preventTypeahead}
        className={cn(
          buttonVariants({ variant: "outline" }),
          triggerWidth,
          "justify-start font-normal",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{value}</span>
        {offset}
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
