class LiberteGraphV2 < Formula
  desc "Liberte Graph visual home schematic editor"
  homepage "https://github.com/avchaykin/liberte-graph-v2"
  head "https://github.com/avchaykin/liberte-graph-v2.git", branch: "main"

  depends_on "node" => :build

  def install
    system "npm", "install"
    system "npm", "run", "build"

    libexec.install "dist"

    (bin/"liberte-graph-v2").write <<~EOS
      #!/bin/bash
      PORT="${1:-4180}"
      exec /usr/bin/python3 -m http.server "$PORT" --bind 0.0.0.0 --directory "#{libexec}/dist"
    EOS
  end

  service do
    run [opt_bin/"liberte-graph-v2", "4180"]
    keep_alive true
    working_dir var
    log_path var/"log/liberte-graph-v2.log"
    error_log_path var/"log/liberte-graph-v2.err.log"
  end

  test do
    assert_match "usage", shell_output("#{bin}/liberte-graph-v2 --help 2>&1").downcase
  end
end
