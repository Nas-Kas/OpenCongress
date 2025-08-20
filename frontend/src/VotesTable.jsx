// Renders flattened member ballots for a House roll call.
export default function VotesTable({ rows }) {
  const badge = (pos) => {
    if (!pos) return <span style={{ padding: "2px 6px", background: "#ccc" }}>—</span>;
    const mapColor = {
      Yea: "#d1fae5",
      Nay: "#fee2e2",
      Present: "#e5e7eb",
      "Not Voting": "#fef3c7",
    };
    return (
      <span style={{ padding: "2px 6px", background: mapColor[pos] ?? "#e5e7eb" }}>
        {pos}
      </span>
    );
  };

  return (
    <table cellPadding={6} style={{ borderCollapse: "collapse", width: "100%" }}>
      <thead>
        <tr>
          <th align="left">Member</th>
          <th align="left">Party</th>
          <th align="left">State</th>
          <th align="left">Vote</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.bioguideId ?? `${m.name}-${m.state}-${m.party}`}>
            <td>{m.name}</td>
            <td>{m.party}</td>
            <td>{m.state}</td>
            <td>{badge(m.position)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
