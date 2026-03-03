import { useState } from "react";
import API from "../services/api";

function ResumeUpload({ setParsedResume }) {
  const [file, setFile] = useState(null);

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append("resume", file);

    const res = await API.post("/resume/upload", formData);

    setParsedResume(res.data.parsedData);
    alert("Resume processed successfully!");
  };

  return (
    <div>
      <h2>Upload Resume</h2>
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={handleUpload}>Upload</button>
    </div>
  );
}

export default ResumeUpload;