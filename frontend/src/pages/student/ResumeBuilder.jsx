import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiPlus, FiSave, FiDownload, FiStar, FiTrash2, FiEye,
  FiEdit3, FiRefreshCw, FiFileText, FiBriefcase, FiCheckCircle,
  FiAlertCircle, FiChevronDown,
} from "react-icons/fi";
import { toast } from "sonner";
import "./ResumeBuilder.css";

const API_ROOT = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://edutrack-7-rey4.onrender.com"
)
  .replace(/\/+$/, "")
  .replace(/\/api$/i, "");

const RESUMES_URL = `${API_ROOT}/api/ai-services/student/resumes/`;
const EMPTY_CONTENT = {
  personal: {
    full_name: "", email: "", phone: "", location: "",
    linkedin: "", github: "", portfolio: "",
  },
  summary: "",
  education: [],
  skills: "",
  projects: [],
  internships: [],
  certifications: [],
  achievements: "",
};

const NEW_RESUME = {
  title: "My Resume",
  target_role: "",
  template: "modern",
  content: EMPTY_CONTENT,
  is_primary: false,
};

function tokenValue() {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of ["access", "access_token", "accessToken"]) {
      const value = storage.getItem(key);
      if (value) return value;
    }
    for (const key of ["tokens", "authTokens", "auth_tokens"]) {
      try {
        const value = JSON.parse(storage.getItem(key) || "null");
        if (value?.access || value?.access_token) return value.access || value.access_token;
      } catch { /* ignore invalid storage values */ }
    }
  }
  return "";
}

async function apiRequest(url, options = {}) {
  const token = tokenValue();
  if (!token) throw new Error("Your login session was not found. Please log in again.");
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.detail || data.error || `Request failed (${response.status}).`);
  }
  return data;
}

function normalizeContent(content = {}) {
  return {
    ...EMPTY_CONTENT,
    ...content,
    personal: { ...EMPTY_CONTENT.personal, ...(content.personal || {}) },
    education: Array.isArray(content.education) ? content.education : [],
    projects: Array.isArray(content.projects) ? content.projects : [],
    internships: Array.isArray(content.internships) ? content.internships : [],
    certifications: Array.isArray(content.certifications) ? content.certifications : [],
    skills: Array.isArray(content.skills) ? content.skills.join(", ") : (content.skills || ""),
    achievements: Array.isArray(content.achievements)
      ? content.achievements.join("\n")
      : (content.achievements || ""),
  };
}

function blankEducation() {
  return { degree: "", institution: "", location: "", start_year: "", end_year: "", score: "" };
}
function blankProject() {
  return { name: "", technologies: "", description: "" };
}
function blankInternship() {
  return { role: "", organization: "", start_date: "", end_date: "", description: "" };
}
function blankCertification() {
  return { name: "", issuer: "", year: "" };
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="rb-field">
      <span>{label}</span>
      <input type={type} value={value || ""} placeholder={placeholder || label} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextField({ label, value, onChange, placeholder, rows = 4 }) {
  return (
    <label className="rb-field rb-field-full">
      <span>{label}</span>
      <textarea rows={rows} value={value || ""} placeholder={placeholder || label} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SectionHeading({ number, title, hint, action }) {
  return (
    <div className="rb-section-heading">
      <div className="rb-section-number">{number}</div>
      <div className="rb-section-title"><h3>{title}</h3>{hint && <p>{hint}</p>}</div>
      {action}
    </div>
  );
}

export default function ResumeBuilder() {
  const [resumes, setResumes] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(NEW_RESUME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState("");
  const [mode, setMode] = useState("edit");
  const [error, setError] = useState("");

  const content = form.content;

  const updateTop = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateContent = (key, value) => setForm((current) => ({
    ...current, content: { ...current.content, [key]: value },
  }));
  const updatePersonal = (key, value) => setForm((current) => ({
    ...current,
    content: { ...current.content, personal: { ...current.content.personal, [key]: value } },
  }));

  const loadResumes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest(RESUMES_URL);
      const list = Array.isArray(data.resumes) ? data.resumes : [];
      setResumes(list);
      if (list.length && !activeId) {
        const selected = list.find((item) => item.is_primary) || list[0];
        setActiveId(selected.id);
        setForm({
          title: selected.title || "My Resume",
          target_role: selected.target_role || "",
          template: selected.template || "modern",
          content: normalizeContent(selected.content),
          is_primary: Boolean(selected.is_primary),
        });
      }
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => { loadResumes(); }, []); // load once on page entry

  const selectResume = (resume) => {
    setActiveId(resume.id);
    setForm({
      title: resume.title || "My Resume",
      target_role: resume.target_role || "",
      template: resume.template || "modern",
      content: normalizeContent(resume.content),
      is_primary: Boolean(resume.is_primary),
    });
    setMode("edit");
  };

  const startNew = () => {
    setActiveId(null);
    setForm({ ...NEW_RESUME, content: normalizeContent({}) });
    setMode("edit");
    toast.info("A new resume draft is ready.");
  };

  const saveResume = async () => {
    if (!content.personal.full_name.trim()) {
      toast.error("Enter your full name before saving the resume.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        title: form.title.trim() || "My Resume",
        content,
      };
      const data = activeId
        ? await apiRequest(`${RESUMES_URL}${activeId}/`, { method: "PATCH", body: JSON.stringify(payload) })
        : await apiRequest(RESUMES_URL, { method: "POST", body: JSON.stringify(payload) });
      const saved = data.resume;
      setActiveId(saved.id);
      setForm({
        title: saved.title,
        target_role: saved.target_role || "",
        template: saved.template || "modern",
        content: normalizeContent(saved.content),
        is_primary: Boolean(saved.is_primary),
      });
      const refreshed = await apiRequest(RESUMES_URL);
      setResumes(refreshed.resumes || []);
      toast.success(data.message || "Resume saved successfully.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteResume = async () => {
    if (!activeId || !window.confirm("Delete this saved resume?")) return;
    try {
      await apiRequest(`${RESUMES_URL}${activeId}/`, { method: "DELETE" });
      setResumes((items) => items.filter((item) => item.id !== activeId));
      setActiveId(null);
      setForm({ ...NEW_RESUME, content: normalizeContent({}) });
      toast.success("Resume deleted.");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const improveText = async (section, text, action = "improve") => {
    if (!String(text || "").trim()) {
      toast.error("Add some content to this section first.");
      return;
    }
    setAiBusy(section);
    try {
      const data = await apiRequest(`${RESUMES_URL}ai-improve/`, {
        method: "POST",
        body: JSON.stringify({ section, text, target_role: form.target_role, action }),
      });
      if (section === "summary") updateContent("summary", data.improved_text);
      else if (section === "skills") updateContent("skills", data.improved_text);
      else if (section === "achievements") updateContent("achievements", data.improved_text);
      else {
        const [kind, index] = section.split(":");
        const list = [...(content[kind] || [])];
        list[Number(index)] = { ...list[Number(index)], description: data.improved_text };
        updateContent(kind, list);
      }
      toast.success("AI suggestion added. Review it before saving.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAiBusy("");
    }
  };

  const generateSummary = async () => {
    setAiBusy("summary");
    try {
      const data = await apiRequest(`${RESUMES_URL}ai-summary/`, {
        method: "POST",
        body: JSON.stringify({ content, target_role: form.target_role }),
      });
      updateContent("summary", data.summary || "");
      toast.success("Professional summary generated. Review it before saving.");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAiBusy("");
    }
  };

  const printResume = () => {
    if (!content.personal.full_name.trim()) {
      toast.error("Add your name before exporting the resume.");
      return;
    }
    setMode("preview");
    window.setTimeout(() => window.print(), 150);
  };

  const updateListItem = (key, index, field, value) => {
    const list = [...content[key]];
    list[index] = { ...list[index], [field]: value };
    updateContent(key, list);
  };
  const addListItem = (key, item) => updateContent(key, [...content[key], item]);
  const removeListItem = (key, index) => updateContent(key, content[key].filter((_, i) => i !== index));

  const skillList = useMemo(() => {
    const rawSkills = String(content.skills || "");
    const lines = rawSkills.includes("\\n") ? rawSkills.split("\\n") : rawSkills.split(",");
    return lines.map((item) => item.trim()).filter(Boolean);
  }, [content.skills]);

  return (
    <main className="rb-page">
      <header className="rb-header">
        <div>
          <span className="rb-eyebrow"><FiStar /> EDUTRACK CAREER STUDIO</span>
          <h1>AI Resume Builder</h1>
          <p>Create an ATS-friendly resume, improve your content with AI, and download a polished PDF.</p>
        </div>
        <div className="rb-header-actions">
          <button className="rb-btn rb-btn-secondary" onClick={startNew}><FiPlus /> New Resume</button>
          <button className="rb-btn rb-btn-primary" onClick={saveResume} disabled={saving}><FiSave /> {saving ? "Saving..." : "Save Resume"}</button>
        </div>
      </header>

      {error && <div className="rb-alert"><FiAlertCircle /> {error} <button onClick={loadResumes}><FiRefreshCw /> Retry</button></div>}

      <div className="rb-workspace">
        <aside className="rb-library">
          <div className="rb-library-heading"><div><span>YOUR WORKSPACE</span><h2>My resumes</h2></div><FiFileText /></div>
          {loading ? <p className="rb-muted">Loading saved resumes...</p> : resumes.length ? resumes.map((resume) => (
            <button key={resume.id} className={`rb-resume-item ${activeId === resume.id ? "active" : ""}`} onClick={() => selectResume(resume)}>
              <span className="rb-resume-item-icon"><FiFileText /></span>
              <span><strong>{resume.title}</strong><small>{resume.target_role || "General resume"}</small></span>
              {resume.is_primary && <i>Primary</i>}
            </button>
          )) : <div className="rb-library-empty">Your saved resumes will appear here.</div>}
          <button className="rb-new-resume" onClick={startNew}><FiPlus /> Create another resume</button>
          <div className="rb-ai-tip"><FiStar /><strong>AI writing assistant</strong><p>Improve your summary, project descriptions and skills for your target role. Always verify AI suggestions before saving.</p></div>
        </aside>

        <section className="rb-editor">
          <div className="rb-editor-top">
            <div><span className="rb-section-kicker">RESUME DETAILS</span><h2>{activeId ? "Edit your resume" : "Build your resume"}</h2></div>
            <div className="rb-tabs">
              <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}><FiEdit3 /> Editor</button>
              <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}><FiEye /> Preview</button>
            </div>
          </div>

          {mode === "edit" ? (
            <div className="rb-form">
              <div className="rb-form-meta">
                <Field label="Resume title" value={form.title} onChange={(v) => updateTop("title", v)} placeholder="e.g. Software Developer Resume" />
                <label className="rb-field"><span>Target job role</span><input value={form.target_role} onChange={(e) => updateTop("target_role", e.target.value)} placeholder="e.g. Python Full Stack Developer" /></label>
                <label className="rb-field"><span>Template</span><select value={form.template} onChange={(e) => updateTop("template", e.target.value)}><option value="modern">Modern</option><option value="classic">Classic</option><option value="minimal">Minimal</option></select></label>
              </div>

              <section className="rb-form-section">
                <SectionHeading number="01" title="Personal information" hint="Use contact details you want employers to see." />
                <div className="rb-grid">
                  <Field label="Full name *" value={content.personal.full_name} onChange={(v) => updatePersonal("full_name", v)} />
                  <Field label="Email" type="email" value={content.personal.email} onChange={(v) => updatePersonal("email", v)} />
                  <Field label="Phone" value={content.personal.phone} onChange={(v) => updatePersonal("phone", v)} />
                  <Field label="Location" value={content.personal.location} onChange={(v) => updatePersonal("location", v)} placeholder="City, State" />
                  <Field label="LinkedIn URL" value={content.personal.linkedin} onChange={(v) => updatePersonal("linkedin", v)} />
                  <Field label="GitHub URL" value={content.personal.github} onChange={(v) => updatePersonal("github", v)} />
                  <Field label="Portfolio URL" value={content.personal.portfolio} onChange={(v) => updatePersonal("portfolio", v)} />
                </div>
              </section>

              <section className="rb-form-section">
                <SectionHeading number="02" title="Professional summary" hint="A short introduction tailored to your target role."
                  action={<button className="rb-ai-button" onClick={generateSummary} disabled={Boolean(aiBusy)}><FiStar /> {aiBusy === "summary" ? "Generating..." : "Generate with AI"}</button>} />
                <TextField label="Summary" value={content.summary} onChange={(v) => updateContent("summary", v)} placeholder="Briefly describe your background, strengths and career interests..." rows={5} />
                <div className="rb-inline-action"><button className="rb-ai-button" onClick={() => improveText("summary", content.summary)} disabled={Boolean(aiBusy)}><FiStar /> Improve summary</button></div>
              </section>

              <section className="rb-form-section">
                <SectionHeading number="03" title="Education" hint="Add your diploma, degree and other relevant education." action={<button className="rb-add-button" onClick={() => addListItem("education", blankEducation())}><FiPlus /> Add education</button>} />
                {content.education.map((item, index) => <div className="rb-entry-card" key={index}>
                  <button className="rb-remove" onClick={() => removeListItem("education", index)} aria-label="Remove education"><FiTrash2 /></button>
                  <div className="rb-grid">
                    {["degree", "institution", "location", "start_year", "end_year", "score"].map((field) => <Field key={field} label={field.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} value={item[field]} onChange={(v) => updateListItem("education", index, field, v)} />)}
                  </div>
                </div>)}
                {!content.education.length && <p className="rb-empty-hint">No education added yet. Use “Add education” to begin.</p>}
              </section>

              <section className="rb-form-section">
                <SectionHeading number="04" title="Technical skills" hint="Separate skills with commas." />
                <TextField label="Skills" value={content.skills} onChange={(v) => updateContent("skills", v)} placeholder="Python, Java, React, Django, PostgreSQL, Git..." rows={3} />
                <div className="rb-inline-action"><button className="rb-ai-button" onClick={() => improveText("skills", content.skills, "skills")} disabled={Boolean(aiBusy)}><FiStar /> Organize skills with AI</button></div>
              </section>

              <section className="rb-form-section">
                <SectionHeading number="05" title="Projects" hint="Highlight projects, your contribution and the technologies used." action={<button className="rb-add-button" onClick={() => addListItem("projects", blankProject())}><FiPlus /> Add project</button>} />
                {content.projects.map((item, index) => <div className="rb-entry-card" key={index}>
                  <button className="rb-remove" onClick={() => removeListItem("projects", index)} aria-label="Remove project"><FiTrash2 /></button>
                  <div className="rb-grid">
                    <Field label="Project name" value={item.name} onChange={(v) => updateListItem("projects", index, "name", v)} />
                    <Field label="Technologies" value={item.technologies} onChange={(v) => updateListItem("projects", index, "technologies", v)} />
                    <TextField label="Description" value={item.description} onChange={(v) => updateListItem("projects", index, "description", v)} rows={3} placeholder="What problem did it solve? What did you build?" />
                  </div>
                  <div className="rb-inline-action"><button className="rb-ai-button" onClick={() => improveText(`projects:${index}`, item.description, "project")} disabled={Boolean(aiBusy)}><FiStar /> {aiBusy === `projects:${index}` ? "Improving..." : "Improve description"}</button></div>
                </div>)}
                {!content.projects.length && <p className="rb-empty-hint">Add academic, personal or internship projects.</p>}
              </section>

              <section className="rb-form-section">
                <SectionHeading number="06" title="Internships / Experience" hint="Include internships, training or relevant practical experience." action={<button className="rb-add-button" onClick={() => addListItem("internships", blankInternship())}><FiPlus /> Add experience</button>} />
                {content.internships.map((item, index) => <div className="rb-entry-card" key={index}>
                  <button className="rb-remove" onClick={() => removeListItem("internships", index)} aria-label="Remove experience"><FiTrash2 /></button>
                  <div className="rb-grid">
                    {["role", "organization", "start_date", "end_date"].map((field) => <Field key={field} label={field.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())} value={item[field]} onChange={(v) => updateListItem("internships", index, field, v)} />)}
                    <TextField label="Description" value={item.description} onChange={(v) => updateListItem("internships", index, "description", v)} rows={3} />
                  </div>
                  <div className="rb-inline-action"><button className="rb-ai-button" onClick={() => improveText(`internships:${index}`, item.description)} disabled={Boolean(aiBusy)}><FiStar /> Improve description</button></div>
                </div>)}
                {!content.internships.length && <p className="rb-empty-hint">No experience? You can leave this section empty.</p>}
              </section>

              <section className="rb-form-section">
                <SectionHeading number="07" title="Certifications" hint="Add relevant courses and professional certifications." action={<button className="rb-add-button" onClick={() => addListItem("certifications", blankCertification())}><FiPlus /> Add certification</button>} />
                {content.certifications.map((item, index) => <div className="rb-entry-card" key={index}>
                  <button className="rb-remove" onClick={() => removeListItem("certifications", index)} aria-label="Remove certification"><FiTrash2 /></button>
                  <div className="rb-grid">
                    {["name", "issuer", "year"].map((field) => <Field key={field} label={field.replace(/\b\w/g, (c) => c.toUpperCase())} value={item[field]} onChange={(v) => updateListItem("certifications", index, field, v)} />)}
                  </div>
                </div>)}
                {!content.certifications.length && <p className="rb-empty-hint">Add certifications when available.</p>}
              </section>

              <section className="rb-form-section">
                <SectionHeading number="08" title="Achievements & activities" hint="Mention awards, leadership, volunteering or notable achievements." />
                <TextField label="Achievements" value={content.achievements} onChange={(v) => updateContent("achievements", v)} placeholder="One achievement per line..." rows={4} />
                <div className="rb-inline-action"><button className="rb-ai-button" onClick={() => improveText("achievements", content.achievements)} disabled={Boolean(aiBusy)}><FiStar /> Improve achievements</button></div>
              </section>

              <div className="rb-bottom-actions">
                {activeId && <button className="rb-btn rb-btn-danger" onClick={deleteResume}><FiTrash2 /> Delete resume</button>}
                <button className="rb-btn rb-btn-secondary" onClick={() => setMode("preview")}><FiEye /> Preview</button>
                <button className="rb-btn rb-btn-primary" onClick={saveResume} disabled={saving}><FiSave /> {saving ? "Saving..." : "Save resume"}</button>
              </div>
            </div>
          ) : (
            <div className="rb-preview-area">
              <div className="rb-paper rb-template-document">
                <header className="rb-paper-header">
                  <h1>{content.personal.full_name || "YOUR NAME"}</h1>
                  {form.target_role && <div className="rb-paper-role">{form.target_role}</div>}
                  <div className="rb-contact-line">
                    {[content.personal.email, content.personal.phone, content.personal.location].filter(Boolean).join("  |  ")}
                  </div>
                  <div className="rb-contact-line">
                    {[content.personal.linkedin, content.personal.github, content.personal.portfolio].filter(Boolean).join("  |  ")}
                  </div>
                </header>

                {content.summary && (
                  <section>
                    <h2>PROFESSIONAL SUMMARY</h2>
                    <p>{content.summary}</p>
                  </section>
                )}

                {content.education.length > 0 && (
                  <section>
                    <h2>EDUCATION</h2>
                    {content.education.map((item, i) => (
                      <div className="rb-paper-entry" key={i}>
                        <div className="rb-paper-entry-heading">
                          <div><strong>{item.degree}</strong>{item.institution && <> | {item.institution}</>}{item.location && <> , {item.location}</>}</div>
                          <span>{[item.start_year, item.end_year].filter(Boolean).join(" – ")}</span>
                        </div>
                        {item.score && <p>Score: {item.score}</p>}
                      </div>
                    ))}
                  </section>
                )}

                {skillList.length > 0 && (
                  <section>
                    <h2>TECHNICAL SKILLS</h2>
                    <ul className="rb-paper-bullets">
                      {skillList.map((skill, i) => {
                        const separator = skill.indexOf(":");
                        return (
                          <li key={i}>
                            {separator > -1 ? (
                              <><strong>{skill.slice(0, separator + 1)}</strong>{skill.slice(separator + 1)}</>
                            ) : skill}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}

                {content.projects.length > 0 && (
                  <section>
                    <h2>PROJECTS</h2>
                    {content.projects.map((item, i) => (
                      <div className="rb-paper-entry" key={i}>
                        <div className="rb-paper-entry-heading"><strong>{item.name}</strong></div>
                        {item.technologies && <p><strong>Technologies:</strong> {item.technologies}</p>}
                        {item.description && <ul className="rb-paper-bullets">{item.description.split("\\n").filter(Boolean).map((line, j) => <li key={j}>{line.replace(/^[-•]\\s*/, "")}</li>)}</ul>}
                      </div>
                    ))}
                  </section>
                )}

                {content.internships.length > 0 && (
                  <section>
                    <h2>EXPERIENCE</h2>
                    {content.internships.map((item, i) => (
                      <div className="rb-paper-entry" key={i}>
                        <div className="rb-paper-entry-heading">
                          <div><strong>{item.role}</strong>{item.organization && <> | {item.organization}</>}</div>
                          <span>{[item.start_date, item.end_date].filter(Boolean).join(" – ")}</span>
                        </div>
                        {item.description && (
                          <ul className="rb-paper-bullets">
                            {item.description.split("\\n").filter(Boolean).map((line, j) => <li key={j}>{line.replace(/^[-•]\\s*/, "")}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                {content.certifications.length > 0 && (
                  <section>
                    <h2>CERTIFICATIONS</h2>
                    <ul className="rb-paper-bullets">
                      {content.certifications.map((item, i) => (
                        <li key={i}><strong>{item.name}</strong>{item.issuer && ` | ${item.issuer}`}{item.year && ` (${item.year})`}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {content.achievements && (
                  <section>
                    <h2>ACHIEVEMENTS &amp; ACTIVITIES</h2>
                    <ul className="rb-paper-bullets">
                      {content.achievements.split("\\n").filter(Boolean).map((line, i) => <li key={i}>{line.replace(/^[-•]\\s*/, "")}</li>)}
                    </ul>
                  </section>
                )}
              </div>
              <div className="rb-preview-actions">
                <button className="rb-btn rb-btn-secondary" onClick={() => setMode("edit")}><FiEdit3 /> Back to editor</button>
                <button className="rb-btn rb-btn-primary" onClick={printResume}><FiDownload /> Download PDF</button>
              </div>
              <p className="rb-print-note">Choose “Save as PDF” in your browser’s print dialog.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
