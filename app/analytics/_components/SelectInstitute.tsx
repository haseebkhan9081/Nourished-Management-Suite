import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Select from "react-select";

type Program = {
  value: string;
  label: string;
  raw: any; // keep original object in case you need full details
};

const fetchPrograms = async (): Promise<Program[]> => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL}/schools`
  );

  if (!response.ok) {
    throw new Error("Network response was not ok");
  }

  const result = await response.json();

  // Transform the API response into react-select options
  return result.programs.map((p: any) => ({
    value: String(p.href), // use href (id) as value
    label: p.title, // display program title
    raw: p, // keep full program data
  }));
};

const SelectInstitute = () => {
  const { data, error, isLoading } = useQuery<Program[]>({
    queryKey: ["programs"],
    queryFn: fetchPrograms,
  });

  const [selectedValue, setSelectedValue] = React.useState<Program | null>(
    null
  );

  // Pre-fill based on URL param
  React.useEffect(() => {
    const url = new URL(window.location.href);
    const programId = url.searchParams.get("programId");

    if (programId && data) {
      const found = data.find((p) => p.value === programId);
      if (found) {
        setSelectedValue(found);
      }
    }
  }, [data]);

  const handleSelectChange = (selectedOption: Program | null) => {
    setSelectedValue(selectedOption);

    const url = new URL(window.location.href);

    if (selectedOption) {
      url.searchParams.set("programId", selectedOption.value);
    } else {
      url.searchParams.delete("programId");
    }

    window.history.pushState({}, "", url.toString());
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {(error as Error).message}</div>;

  return (
    <div className="w-full justify-center items-center flex space-y-4 flex-col">
      <h3 className="text-slate-500">Program:</h3>
      <Select
        value={selectedValue}
        onChange={handleSelectChange}
        options={data || []}
        placeholder="Select Institution ..."
        className="w-[280px] rounded-xl border-primary"
        styles={{
          control: (baseStyles) => ({
            ...baseStyles,
            borderColor: "#a2bd9d",
            borderRadius: "12px",
          }),
        }}
      />
    </div>
  );
};

export default SelectInstitute;
