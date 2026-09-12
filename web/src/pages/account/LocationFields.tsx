import { Field, Select } from "@/components/kit/Form";
import { useDistricts, useTowns } from "@/features/helpers/queries";

/**
 * District, then town. Changing the district clears the town, so a town from
 * the old district is never left attached to the new one -- the backend
 * refuses that pairing anyway.
 */
export function LocationFields({
  district,
  town,
  onChange,
  idPrefix,
}: {
  district: string | null;
  town: string | null;
  onChange: (next: { district: string | null; town: string | null }) => void;
  idPrefix: string;
}) {
  const districts = useDistricts();
  const towns = useTowns(district ?? undefined);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="District" htmlFor={`${idPrefix}-district`}>
        <Select
          id={`${idPrefix}-district`}
          value={district ?? ""}
          onChange={(event) => onChange({ district: event.target.value || null, town: null })}
        >
          <option value="" disabled>
            Choose a district
          </option>
          {districts.data?.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Town"
        htmlFor={`${idPrefix}-town`}
        hint={district ? undefined : "Pick a district first."}
      >
        <Select
          id={`${idPrefix}-town`}
          disabled={!district}
          value={town ?? ""}
          onChange={(event) => onChange({ district, town: event.target.value || null })}
        >
          <option value="">Anywhere in the district</option>
          {towns.data?.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
